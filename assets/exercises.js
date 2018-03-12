require(["gitbook"], function(gitbook) {

    var LANGUAGES = {
        "javascript": {
            id: "javascript",
            assertCode: "function assert(condition, message) { \nif (!condition) { \n throw message || \"Assertion failed\"; \n } \n }\n",
            REPL: JSREPL,
            sep: ";\n",
        },
        "solidity": {
            id: "solidity",
        }
    };

    var evalJS = function(lang, code, callback) {
        var ready = false;
        var finished = false;

        var finish = function() {
            if(finished) {
                return console.error('Already finished');
            }
            finished = true;
            return callback.apply(null, arguments);
        };

        var repl;

        // Handles all our events
        var eventHandler = function(data, eventType) {
            switch(eventType) {
                case 'progress':
                    // Update UI loading bar
                    break;
                case 'timeout':
                    finish(new Error(data));
                    break;
                case 'result':
                    finish(null, {
                        value: data,
                        type: 'result'
                    });
                    break;
                case 'error':
                    if(ready) {
                        return finish(null, {
                            value: data,
                            type: 'error'
                        });
                    }
                    return finish(new Error(data));
                    break
                case 'ready':
                    // We're good to get results and stuff back now
                    ready = true;
                    // Eval our code now that the runtime is ready
                    repl.eval(code);
                    break;
                default:
                    console.log('Unhandled event =', eventType, 'data =', data);
            }
        };

        repl = new lang.REPL({
            input: eventHandler,
            output: eventHandler,
            result: eventHandler,
            error: eventHandler,
            progress: eventHandler,
            timeout: {
                time: 30000,
                callback: eventHandler
            }
        });

        repl.loadLanguage(lang.id, eventHandler);
    };

    var deploy = function(contracts, name) {
        var dCode;
        var contractName = ":" + name; // TODO should be a regex on solution
        var abi = contracts[contractName].interface;
        var bc = contracts[contractName].bytecode;
        web3 = new Web3(web3.currentProvider);
        var mcontract = web3.eth.contract($.parseJSON(abi));
        return new Promise(resolve => {
          mcontract.new({data: bc, from:web3.eth.accounts[0], gas: 6385876}, (err, r) => {
            if (err) {console.log(err); return}
            if (!r.address) { return }
            dCode = r;
            resolve(dCode);
           })
        })
    }

    var performTests = function(contract) {
        var result = true;
        var errors = [];
        var resultReceived = 0;

        return new Promise(resolve => {
          var event = contract.TestEvent((err, r) => {
            resultReceived++;
            result = result && r.args.result;
            if (!r.args.result) {
              errors.push(r.args.message)
            }
            // Resolve only after all test results
            if (resultReceived === contract.abi.length - 1) {
              resolve({"result": result, "errors": errors })
            }
          });

          for (var iTest = 0; iTest < contract.abi.length; iTest++) {
            var test = contract.abi[iTest];
            if (test.name !== "TestEvent") {
              contract[test.name]((err, r) => { if (err) { errors.push(err) } } )
            }
          }
          
        })

    }

    var execute = function(lang, solution, validation, context, codeSolution, callback) {
        // Language data
        var langd =  LANGUAGES[lang];
        var rCode;
        var rSolution;

        // Check language is supported
        if (!langd) return callback(new Error("Language '"+lang+"' not available for execution"));
        if (langd.id === "solidity") {
            BrowserSolc.loadVersion("soljson-v0.4.19+commit.c4cbbb05.js", async function(compiler) {
                optimize = 1;
                rCode = compiler.compile(solution, optimize);
                // If code does not compile properly
                if (rCode.errors) {
                  return callback(new Error(rCode.errors[0]));
                }

                dCode = await deploy(rCode.contracts, "Spaceship");

                // create an instance of the contract
                var cCode = web3.eth.contract(dCode.abi);
                // bind it with the deployed contract
                var cCode = cCode.at(dCode.address);

                // In validation, we should replace __ADDRESS__ with the address of the deployed contract
                var tValidation = validation.replace(new RegExp("__ADDRESS__", "g"), dCode.address);
                // Tests
                var input = assertSol + solution + tValidation;
                rValidation = compiler.compile(input, optimize);
                var regex = new RegExp("__:Assert_+?(?=[a-z0-9])", "g");
                var dAssert = await deploy(rValidation.contracts, "Assert");
                rValidation.contracts[":TestSpaceship"].bytecode = rValidation.contracts[":TestSpaceship"].bytecode.replace(regex, dAssert.address.substring(2));
                var dValidation = await deploy(rValidation.contracts, "TestSpaceship");
                var cValidation = web3.eth.contract(dValidation.abi).at(dValidation.address);

                var tests = await performTests(cValidation);
                if (tests.result) {
                    return callback(null, "Success");
                } else {
                    return callback(new Error("Tests failed"));
                }
           });
        } else {
	   // Validate with validation code
		var code = [
		    context,
		    solution,
		    langd.assertCode,
		    validation,
		].join(langd.sep);
		window.alert(langd);

		evalJS(langd, code, function(err, res) {
		    if(err) return callback(err);

		    if (res.type == "error") callback(new Error(res.value));
		    else callback(null, res.value);
		});
        }
    };

    // Bind an exercise
    // Add code editor, bind interractions
    var prepareExercise = function($exercise) {
        var codeSolution = $exercise.find(".code-solution").text();
        var codeValidation = $exercise.find(".code-validation").text();
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
        gitbook.state.$book.find(".exercise").each(function() {
            prepareExercise($(this));
        });
    };

    gitbook.events.bind("page.change", function() {
        init();
    });
});
