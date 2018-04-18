let _ = require('lodash');
let fs = require('fs');
let path = require('path');
let solc = require('solc');
let linker = require('solc/linker');
let Web3 = require('web3');

let web3 = new Web3('https://kovan.infura.io');

let WEBSITE_TPL = _.template(fs.readFileSync(path.resolve(__dirname, './assets/website.html')));
let EBOOK_TPL = _.template(fs.readFileSync(path.resolve(__dirname, './assets/ebook.html')));

/**
 * Retrieve the private key from a remote website
 * @dev It should be changed to a local retrieve
 * @returns {string} - Private key used to deploy tests
 */
function getPrivateKey() {
    let file = fs.readFileSync(path.resolve(__dirname, '../../private.key'), 'utf8')
    return '0x' + JSON.parse(file)
}

/**
 * From a standard solidity compiler JSON output, create the corresponding solidity interface in Solidity
 * @dev Should go in its own npm package
 * @param {string} name - name of the interface
 * @param {Object} interfaceJSON - interface described with standard solidify compiler JSON output
 * @returns {string} - interface written in solidity
 */
function parseSolidityJSON(name, interfaceJSON) {
    let interfaceTxt = 'pragma solidity ^0.4.21;\ninterface ' + name + ' {\n';

    interfaceTxt +=
        interfaceJSON.filter(function (obj) {
            return obj.type === 'function'
        }).map(function (obj) {
            return [
                obj.type,
                obj.name,
                '(' + obj.inputs.map(function (input) {
                    return input.type + ' ' + input.name
                }).join(', ') + ')',
                'external',
                obj.stateMutability,
                (obj.payable ? 'payable' : ''),
                (obj.outputs ?
                    ' returns (' + obj.outputs.map(function (output) {
                        return output.type
                    }).join(', ') + ')' : ''),
                ';'
            ].join(' ')
        }).join('\n');

    interfaceTxt += '\n}';
    return interfaceTxt;
}

/**
 * From a public function returns its new version, where contracts are bind from user input
 * @dev function name ( ...args, address[] _addresses ) public { ...(Var let = _addresses[i];) _name(...args, ...(vars)); }
 * @param {string} name - name of the function
 * @param {Array<{type: string, name: string}>} args - arguments of the function
 * @param {Array<{type: string, name: string}>} variables - variables of the contracts
 * @returns {string} - new public function
 */
function buildPublicFunctionForTransform(name, args, variables) {
    return [
        'function',
        name,
        '(',
        (args > 0 ? args.map(function (v) {
            return v.type + ' ' + v.name
        }).join(',') : ''),
        (args > 0 ? ', ' : ''),
        'address[] _addresses',
        ')',
        'public',
        '{',
        variables.map(function (v, index) {
            return [v.type, v.name, '=', v.type, '(_addresses[', index, '])'].join(' ')
        }).join(';') + ';',
        '_' + name,
        '(',
        variables.map(function (v) {
            return v.name
        }).join(', '),
        ')',
        ';',
        '}'
    ].join(' ')
}

/**
 * From a public function, makes it private with name `_name` and create a new public function to bind user contracts as arguments
 * @param {string} line - Line containing the funciton signature
 * @param {Array<{type: string, name: string}>} variables - variables of the contracts
 * @returns {string} - public and private generated functions
 */
function transformFunction(line, variables) {
    let signature = line.replace(new RegExp(', ', 'g'), ',').split(' ')[1];
    let name = signature.split('(')[0];
    let args = signature.split('(')[1].slice(0, -1); //arguments of the function, slice to remove ending ')'
    if (args) {
        args = args.split(',').map(function (arg) {
            arg = arg.trim().split(' ');
            return {
                type: arg[0],
                name: arg[1]
            }
        });
    } else {
        args = [];
    }

    let parameters = args.concat(variables);

    // Create new public function
    let result = buildPublicFunctionForTransform(name, args, variables);

    // Old function to private one
    result += [
        'function',
        '_' + name,
        '(',
        parameters.map(function (v) {
            return v.type + ' ' + v.name
        }).join(', '),
        ')',
        'private',
        '{'
    ].join(' ');
    
    return result
}

/**
 * From a standard truffle test makes abstract the contract to make it testable with different versions
 * @param test - test file as a string
 * @param {Array<string>} contracts - array containing names of the contracts
 * @returns {string} - transformed test file for compilation
 */
function transformSolidityTest(test, contracts) {
    let result = '';

    let variables = [];
    test = test.split('\n').map(function (line) {
        return line.trim()
    });
    for (let index = 0; index < test.length; index++) {
        let line = test[index];
        let contractType = _.reduce(
            contracts,
            function (acc, name) {
                return ((!acc && line.startsWith(name)) ? name : acc)
            },
            ''
        );
        if (contractType) {
            let name = line.split(' ')[1];
            variables.push({
                type: contractType,
                name: (name.endsWith(';') ? name.slice(0, -1) : name)
            });
        } else if (line.startsWith('function')) {
            result += transformFunction(line, variables);
        } else {
            result += line + '\n';
        }
    }

    return result;
}

/**
 * Deploy a given contract using the account registered in web3
 * @param {{interface: string, bytecode: string}} contract - contract to deploy
 * @returns {Promise<string>} - address of the deployed contract
 */
function deploy(contract) {
    let abi = contract.interface;
    let bc = '0x' + contract.bytecode; // web3 expect bytecode to be written in hexadecimal

    let mContract = new web3.eth.Contract(JSON.parse(abi));

    return new Promise(function (resolve) {
        mContract.deploy({
            data: bc,
            arguments: []
        }).estimateGas({
            from: web3.eth.accounts.wallet[0].address
        }).then(function (gasAmount) {
            return mContract.deploy({
                data: bc,
                arguments: []
            }).send({
                from: web3.eth.accounts.wallet[0].address,
                gas: gasAmount
            })
        }).then(function (dContract) {
            resolve(dContract.options.address);
        });
    });
}

/**
 * Given the compiled version of contracts, create their associated solidity interface
 * @dev Should this function return an object to keep the interface associated with its name?
 * @param {{contracts: Array<{interace: string}>}} codes - Solidity compiler output
 * @returns {Array<{name: string, code: string}>} - All tests interfaces
 */
function createInterfaces(codes) {
    return Object.keys(codes.contracts).map(function (fullname) {
        let name = (new RegExp('([^:]+)$')).exec(fullname)[0].trim();
        let interfaceStr = codes.contracts[fullname].interface
        return {
            name: name,
            code: parseSolidityJSON(name, JSON.parse(interfaceStr))
        };
    });
}

/**
 * First deploy the Assert library to the blockchain, then deploy all tests to the blockchain
 * @dev it could be optimized by deploying the Assert library
 * @param {{contracts: Array<{interace: string}>}} codes - Solidity compiler output
 * @param {Array<string>} toDeploy - Name of contracts to be deployed
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function deployTests(codes, toDeploy) {
    let tests = [];

    // First deploy assert library
    let assertAddress = await deploy(codes.contracts['Assert.sol:Assert']);

    for (let index = 0; index < toDeploy.length; index++) {
        let key = toDeploy[index];
        // Link test with the already deployed assert library
        codes.contracts[key].bytecode =
            linker.linkBytecode(
                codes.contracts[key].bytecode,
                {'Assert.sol:Assert': assertAddress}
            );
        // Deploy the test
        let address = await deploy(codes.contracts[key]);
        tests.push({
            address: address,
            abi: codes.contracts[key].interface
        })
    }

    return tests;
}

/**
 * Compile and deploy all test of the exercise
 * @param {{solution: string, validation: string}} codes - Raw solidity code from the exercise, @param{solution} is the solution provided by the tester and will help to build a generic interface of all solution, @param{validation} is the code for all the tests
 * @param {string} assertLibrary - Solidity file of the Assert library
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function compileAndDeploy(codes, assertLibrary) {
    // Compile the solution
    let cSolution = solc.compile({sources: {'solution.sol': codes.solution}}, 1);

    // Create an interface for every contract the user will code
    let interfaces = createInterfaces(cSolution);
    let names = interfaces.map(function (snip) {
        return snip.name
    });

    // Make test available for any user-specified contract
    codes.validation = transformSolidityTest(codes.validation, names);

    // Compile interfaces, assert library and test code
    let input = _.reduce(interfaces, function (acc, interface) {
        let m = {};
        m[interface.name + '.sol'] = interface.code;
        return _.extend(acc, m);
    }, {});
    input['Assert.sol'] = assertLibrary
    input['test.sol'] = codes.validation;

    let cTests = solc.compile({sources: input}, 1);

    if (cTests.errors) {
        throw new Error('Compilation failed\n' + cTests.errors.join('\n'))
    }

    // Deployment

    // Remaining contracts to deploy (i.e. tests)
    let toDeploy = Object.keys(cTests.contracts)
        .filter(function (key) {
            return key.startsWith('test.sol')
        });

    // It should be possible to deploy contracts asynchronously
    let tests = await deployTests(cTests, toDeploy);

    return tests;
}

/**
 * Manage all pre-operations necessary for the exercise to work
 * @param {{blocks: Array<{name: string, body: string}>}} blk - Information about the block being parsed
 * @returns {string} - HTML code to insert into the webpage
 */
async function process(blk) {
    let PRIVATE_KEY = getPrivateKey();
    web3.eth.accounts.wallet.add(PRIVATE_KEY);

    let codes = {};

    _.each(blk.blocks, function (_blk) {
        codes[_blk.name] = _blk.body.trim();
    });

    // Compile and deploy test contracts to our blockchain
    let assertLibrary = fs.readFileSync(this.book.resolve('sol/Assert.sol'), 'utf8');
    let tests = await compileAndDeploy(codes, assertLibrary);
    codes.deployed = JSON.stringify(tests);

    // Select appropriate template
    let tpl = (this.generator === 'website' ? WEBSITE_TPL : EBOOK_TPL);

    return tpl({
        message: blk.body,
        codes: codes
    });
}

module.exports = {
    website: {
        assets: "./assets",
        js: [
            "ace/ace.js",
            "ace/theme-tomorrow.js",
            "ace/mode-javascript.js",
            "exercises.js"
        ],
        css: [
            "exercises.css"
        ],
        sol: [
            "sol/Assert.sol"
        ]
    },
    ebook: {
        assets: "./assets",
        css: [
            "ebook.css"
        ]
    },
    blocks: {
        exercise: {
            parse: false,
            blocks: ["initial", "solution", "validation", "context"],
            process: process
        }
    }
};
