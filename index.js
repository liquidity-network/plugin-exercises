var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var request = require('request');
var solc = require('solc');
var linker = require('solc/linker');
var Web3 = require('web3');

var web3 = new Web3('https://kovan.infura.io');

var WEBSITE_TPL = _.template(fs.readFileSync(path.resolve(__dirname, "./assets/website.html")));
var EBOOK_TPL = _.template(fs.readFileSync(path.resolve(__dirname, "./assets/ebook.html")));

function getPrivateKey() {
    var url = 'https://www.thibaultmeunier.com/private.key';

    return new Promise(function (resolve, reject) {
        request.get({
            url: url,
            json: true,
            headers: {'User-Agent': 'request'}
        }, function(err, res, data) {
            if(err) {
                reject();
            } else {
                resolve('0x' + data);
            }
        });
    });
}

// Should go in its own npm package
function parseSolidityJSON(name, interfaceStr) {
    var interface = JSON.parse(interfaceStr);

    var interfaceTxt = 'pragma solidity ^0.4.21;\ninterface ' + name + ' {\n';

    interfaceTxt +=
        interface.filter(function (obj) {
            return obj.type === 'function'
        }).map(function (obj) {
            var result = '    ';
            result += obj.type;
            result += ' ' + obj.name;
            result += '(' + obj.inputs.map(function (input) {
                return input.type + ' ' + input.name
            }).join(', ') + ')';
            result += ' ' + 'external';
            result += ' ' + obj.stateMutability;
            if (obj.payable) {
                result += ' ' + 'payable';
            }
            if (obj.outputs) {
                result += ' returns (' + obj.outputs.map(function (output) {
                    return output.type
                }).join(', ') + ')';
            }
            return result + ';';
        }).join('\n');

    interfaceTxt += '\n}';
    return interfaceTxt;
}

// @param test test file as a string
// @param contracts array containing names of the contracts
// @return result transformed test file for compilation
function transformSolidityTest(test, contracts) {
    var result = '';

    var variables = [];
    test = test.split('\n').map(function (line) {
        return line.trim()
    });
    for (var index = 0; index < test.length; index++) {
        var line = test[index];
        var contractType = _.reduce(
            contracts,
            function (acc, name) {
                return ((!acc && line.startsWith(name)) ? name : acc)
            },
            ''
        );
        if (contractType) {
            var name = line.split(' ')[1];
            variables.push({
                type: contractType,
                name: (name.endsWith(';') ? name.slice(0, -1) : name)
            });
        } else if (line.startsWith('function')) {
            var signature = line.replace(new RegExp(', ', 'g'), ',').split(' ')[1];
            var name = signature.split('(')[0];
            var args = signature.split('(')[1].slice(0, -1); //arguments of the function, slice to remove ending ')'
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

            var parameters = args.concat(variables);

            // @dev function name ( ...args, address[] _addresses ) public { ...(Var var = _addresses[i];) _name(...args, ...(vars)); }
            result += [
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
            ].join(' ');

            // old function to private one
            // @dev function _name ( ...args ) private {
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
        } else {
            result += line + '\n';
        }
    }

    return result;
}

function deploy(contract) {
    var abi = contract.interface;
    var bc = '0x' + contract.bytecode; // web3 expect bytecode to be written in hexadecimal

    var mContract = new web3.eth.Contract(JSON.parse(abi));

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

function createInterfaces(codes) {
    return Object.keys(codes.contracts).map(function (fullname) {
        var name = (new RegExp('([^:]+)$')).exec(fullname)[0].trim();
        return {
            name: name,
            code: parseSolidityJSON(name, codes.contracts[fullname].interface)
        };
    });
}

async function deployTests(codes, toDeploy) {
    var tests = [];

    // First deploy assert library
    var assertAddress = await deploy(codes.contracts['Assert.sol:Assert']);

    for (var index = 0; index < toDeploy.length; index++) {
        var key = toDeploy[index];
        // Link test with the already deployed assert library
        codes.contracts[key].bytecode =
            linker.linkBytecode(
                codes.contracts[key].bytecode,
                {'Assert.sol:Assert': assertAddress}
            );
        // Deploy the test
        var address = await deploy(codes.contracts[key]);
        tests.push({
            address: address,
            abi: codes.contracts[key].interface
        })
    }

    return tests;
}

async function compileAndDeploy(codes, book) {
    // Compile the solution
    var cSolution = solc.compile({sources: {'solution.sol': codes.solution}}, 1);

    // Create an interface for every contract the user will code
    var interfaces = createInterfaces(cSolution);
    var names = interfaces.map(function (snip) {
        return snip.name
    });

    // Make test available for any user-specified contract
    codes.validation = transformSolidityTest(codes.validation, names);

    // Compile interfaces, assert library and test code
    var input = _.reduce(interfaces, function (acc, interface) {
        var m = {};
        m[interface.name + '.sol'] = interface.code;
        return _.extend(acc, m);
    }, {});
    input['Assert.sol'] = fs.readFileSync(book.resolve('sol/Assert.sol'), 'utf8');
    input['test.sol'] = codes.validation;

    var cTests = solc.compile({sources: input}, 1);

    if (cTests.errors) {
        throw new Error('Compilation failed\n' + cTests.errors.join('\n'))
    }

    // Deployment

    // Remaining contracts to deploy (i.e. tests)
    var toDeploy = Object.keys(cTests.contracts)
        .filter(function (key) {
            return key.startsWith('test.sol')
        });

    // It should be possible to deploy contracts asynchronously
    var tests = await deployTests(cTests, toDeploy);

    return tests;
}

async function process(blk) {
    var PRIVATE_KEY = await getPrivateKey();
    web3.eth.accounts.wallet.add(PRIVATE_KEY);

    var codes = {};

    _.each(blk.blocks, function (_blk) {
        codes[_blk.name] = _blk.body.trim();
    });

    // Compile and deploy test contracts to our blockchain
    var tests = await compileAndDeploy(codes, this.book);
    codes.deployed = JSON.stringify(tests);

    // Select appropriate template
    var tpl = (this.generator === 'website' ? WEBSITE_TPL : EBOOK_TPL);

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
