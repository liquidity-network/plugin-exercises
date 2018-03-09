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

    var deploy = function(contracts, name, callback) {
        var contractName = ":" + name; // TODO should be a regex on solution
        var abi = contracts[contractName].interface;
        var bc = contracts[contractName].bytecode;
        web3 = new Web3(web3.currentProvider);
        var mcontract = web3.eth.contract($.parseJSON(abi));
        var deployed = mcontract.new({data: bc, from:web3.eth.accounts[0], gas: 1000000}, callback)
    }

    var execute = function(lang, solution, validation, context, codeSolution, callback) {
        // Language data
        var langd =  LANGUAGES[lang];
        var rCode;
        var rSolution;

        // Check language is supported
        if (!langd) return callback(new Error("Language '"+lang+"' not available for execution"));
        if (langd.id === "solidity") {
            BrowserSolc.loadVersion("soljson-v0.4.19+commit.c4cbbb05.js", function(compiler) {
                optimize = 1;
                rCode = compiler.compile(solution, optimize);
                rSolution = compiler.compile(codeSolution, optimize);

                dCode = deploy(rCode.contracts, "Spaceship", (err, r) => {dCode = r;});

                // TODO: async assignation should be sync

                /*
                // create an instance of the contract
                var cCode = web3.eth.contract(dCode.abi);
                // bind it with the deployed contract
                var cCode = cCode.at(dCode.address);
                // call the 1st (0) method and log the result
                // In spaceship example, first method is x and returns BigNumber(0)
                cCode[dCode.abi[0].name]((err, r) => { console.log(r.toNumber()); });
                */

                // In validation, we should replace __ADDRESS__ with the address of the deployed contract
                var tValidation = validation.replace("__ADDRESS__", dCode.address);
                // Tests
                var input = assertSol + solution + validation;
                rValidation = compiler.compile(input, optimize);
                console.log(rValidation);
                deploy(rValidation.contracts, "TestSpaceship", (err, r) => {console.log(r);});
                // console.log(rValidation);

                if (JSON.stringify(rCode.contracts) === JSON.stringify(rSolution.contracts)) {
                    return callback(null, "Success");
                } else {
                    return callback(new Error(rCode.errors[0]));
                }
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
