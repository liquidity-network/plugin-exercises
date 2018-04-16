require(["gitbook"], function(gitbook) {

    var LANGUAGES = {
        "solidity": {
            id: "solidity",
        }
    };

    var currentCompiler = undefined;
    var loadCompiler = function() {
        setLoading('Loading compiler');
        return new Promise(resolve => {
            if (currentCompiler === undefined) {
                BrowserSolc.loadVersion("soljson-v0.4.21+commit.dfe3193c.js", compiler => {
                    currentCompiler = compiler;
                    resolve(compiler);
                })
            } else {
                resolve(currentCompiler);
            }
        })
    };

    var setLoading = function(message) {
        $('#loading-message').text(message);
    };

    var estimateGas = function(data) {
        return new Promise(resolve => {
            web3.eth.estimateGas({data: data}, (err, r) => {
                if (err) {console.log(err); return;}
                resolve(r);
            })
        })
    };

    var deploy = function(contract) {
        var dCode;
        var abi = contract.interface;
        var bc = '0x' + contract.bytecode;
        var mcontract = web3.eth.contract(JSON.parse(abi));
        return new Promise((resolve, reject) => {
            estimateGas(bc).then(estimate => {
                mcontract.new({data: bc, from:web3.eth.accounts[0], gas: estimate}, (err, r) => {
                    if(err) {
                        console.log(err);
                        reject();
                        return
                    }
                    if(!r.address) {
                        return
                    }
                    dCode = r;
                    resolve(dCode);
                });
            })
        })
    };

    var performTests = function(contract, addresses) {
        var result = true;
        var errors = [];
        var resultReceived = 0;

        return new Promise(resolve => {
            var event = contract.TestEvent((err, r) => {
                resultReceived++;
                setLoading('Test ' + resultReceived + '/' + (contract.abi.length-1));
                result = result && r.args.result;
                if (!r.args.result) {
                    errors.push(r.args.message)
                }
                // Resolve only after all test results
                if (resultReceived === contract.abi.length - 1) {
                    resolve({result: result, errors: errors })
                }
            });

            var iTest;
            for (iTest = 0; iTest < contract.abi.length; iTest++) {
                setLoading('Test ' + 0 + '/' + (contract.abi.length-1));
                var test = contract.abi[iTest];
                if (test.type === "function") {
                    contract[test.name](addresses, (err, r) => { if (err) { errors.push(err) } } )
                }
            }

            // If contract.abi has only TestEvent or nothing
            if (contract.abi.length <= 1) {
                resolve({ result: true, errors: [] });
            }

        })

    };

    var execute = async function(lang, solution, validation, context, codeSolution, callback) {
        // Language data
        var langd =  LANGUAGES[lang];
        var rCode;
        var rSolution;

        // Check language is supported
        if (!langd) return callback(new Error("Language '"+lang+"' not available for execution"));
        if (langd.id === "solidity") {
            compiler = await loadCompiler();
            optimize = 1;

            setLoading('Compiling your submission');
            rCode = compiler.compile(solution, optimize);
            rCodeSolution = compiler.compile(codeSolution, optimize);
            // If code does not compile properly
            if (rCode.errors) {
                return callback(new Error(rCode.errors[0]));
            } else {
                var notDefined = Object.keys(rCodeSolution.contracts)
                    .filter(function(name) {
                        return rCode.contracts[name] === undefined
                    }).map(function(name) {
                       return name.substring(1)
                    });

                if (notDefined.length > 0) {
                    return callback(new Error('Contracts [' + notDefined.join(', ') + '] are not defined'));
                }
            }

            var addresses = []

            var index = 1;
            // Deploy all contracts
            for (var name of Object.keys(rCode.contracts)) {
                name = name.substring(1);
                setLoading('Deploying ' + name + '\t ' + index++ + '/' + Object.keys(rCode.contracts).length);
                try {
                    var dCode = await deploy(rCode.contracts[':' + name]);
                    addresses.push(dCode.address);
                } catch (error) {
                    console.log(error);
                    return callback(new Error('Deployment error for contract ' + name));
                }
            };

            setLoading('Testing');
            validation = JSON.parse(validation);

            var tests = true;
            var index;
            for (index = 0; index < validation.length; index++) {
                var test = validation[index];

                var cTest = web3.eth.contract(JSON.parse(test.abi)).at(test.address);

                var r = await performTests(cTest, addresses);
                tests = tests && r.result;
            }
            if (tests) {
                return callback(null, "Success");
            } else {
                return callback(new Error("Tests failed"));
            }
        }
    };

    // Bind an exercise
    // Add code editor, bind interractions
    var prepareExercise = function($exercise) {
        var codeSolution = $exercise.find(".code-solution").text();
        var codeValidation = $exercise.find(".code-deployed").text();
        var codeContext = $exercise.find(".code-context").text();

        var editor = ace.edit($exercise.find(".editor").get(0));
        editor.setTheme("ace/theme/tomorrow");
        editor.getSession().setUseWorker(false);
        editor.getSession().setMode("ace/mode/javascript");

        editor.commands.addCommand({
            name: "submit",
            bindKey: "Ctrl-Return|Cmd-Return",
            exec: function() {
                $exercise.find(".action-submit").click();
            }
        });

        // Submit: test code
        $exercise.find(".action-submit").click(function(e) {
            e.preventDefault();

            gitbook.events.trigger("exercise.submit", {type: "code"});

            setLoading('Loading...');
            $exercise.toggleClass("return-loading", true);
            $exercise.toggleClass("return-error", false);
            $exercise.toggleClass("return-success", false);
            execute("solidity", editor.getValue(), codeValidation, codeContext, codeSolution, function(err, result) {
                $exercise.toggleClass("return-loading", false);
                $exercise.toggleClass("return-error", err != null);
                $exercise.toggleClass("return-success", err == null);
                if (err) $exercise.find(".alert-danger").text(err.message || err);
            });
        });

        // Set solution
        $exercise.find(".action-solution").click(function(e) {
            e.preventDefault();

            editor.setValue(codeSolution);
            editor.gotoLine(0);
        });
    };

    // Prepare all exercise
    var init = function() {
        web3 = new Web3(web3.currentProvider);
        gitbook.state.$book.find(".exercise").each(function() {
            prepareExercise($(this));
        });
    };

    gitbook.events.bind("page.change", function() {
        init();
    });
});
