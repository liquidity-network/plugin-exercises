/* global $, ace, BrowserSolc, web3, Web3, XMLHttpRequest */

require(['gitbook'], (gitbook) => {
  const apiURL = 'https://blockchainworkbench.com/api'
  let user = new Promise((resolve, reject) => {
    if (window.user) {
      window.user.then(user => { resolve(user) })
      return
    }
    setTimeout(() => { window.user.then(user => { resolve(user) }) }, 1000)
  })

  const LANGUAGES = {
    'solidity': {
      id: 'solidity'
    }
  }

  let currentCompiler
  const loadCompiler = () => {
    setLoading('Loading compiler')
    return new Promise(resolve => {
      if (currentCompiler === undefined) {
        BrowserSolc.loadVersion('soljson-v0.4.21+commit.dfe3193c.js', compiler => {
          currentCompiler = compiler
          resolve(compiler)
        })
      } else {
        resolve(currentCompiler)
      }
    })
  }

  const setLoading = (message) => {
    $('#loading-message').text(message)
  }

  const estimateGas = (data) => {
    return new Promise(resolve => {
      web3.eth.estimateGas({data: data}, (err, r) => {
        if (err) { console.log(err); return }
        resolve(r)
      })
    })
  }

  const deploy = (contract) => {
    const abi = contract.interface
    const bc = '0x' + contract.bytecode
    const mcontract = web3.eth.contract(JSON.parse(abi))
    return new Promise((resolve, reject) => {
      estimateGas(bc).then(estimate => {
        mcontract.new({data: bc, from: web3.eth.accounts[0], gas: estimate}, (err, r) => {
          if (err) {
            console.log(err)
            reject(new Error(err))
            return
          }
          if (!r.address) {
            return
          }
          resolve(r)
        })
      })
    })
  }

  const performTests = (contract, addresses) => {
    let result = true
    const errors = []
    let resultReceived = 0

    return new Promise(resolve => {
      contract.TestEvent((err, r) => {
        resultReceived++
        setLoading('Test ' + resultReceived + '/' + (contract.abi.length - 1))
        result = result && r.args.result
        if (!r.args.result) {
          errors.push(r.args.message)
        }
        // Resolve only after all test results
        if (resultReceived === contract.abi.length - 1) {
          resolve({ result: result, errors: errors })
        }
      })

      for (let iTest = 0; iTest < contract.abi.length; iTest++) {
        setLoading('Test ' + 0 + '/' + (contract.abi.length - 1))
        const test = contract.abi[iTest]
        if (test.type === 'function') {
          contract[test.name](addresses, (err, r) => { if (err) { errors.push(err) } })
        }
      }

      // If contract.abi has only TestEvent or nothing
      if (contract.abi.length <= 1) {
        resolve({ result: true, errors: [] })
      }
    })
  }

  const exerciseSuccess = (id) => {
    const url = `${apiURL}/exercises/${id}`
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
    xhr.send()
    window.user.then((user) => {
      window.user = new Promise((resolve, reject) => {
        if (user.exercises.includes(id)) {
          resolve(user)
        } else {
          user.exercises.push(id)
          resolve(user)
        }
      })
    })
  }

  const hasExerciseBeenSolved = async (id) => {
    let u = await user
    return u.exercises.includes(id)
  }

  const execute = async (lang, solution, validation, context, codeSolution, id, callback) => {
    // Language data
    const langd = LANGUAGES[lang]

    // Check language is supported
    if (!langd) return callback(new Error('Language `' + lang + '` not available for execution'))
    if (langd.id === 'solidity') {
      const compiler = await loadCompiler()
      const optimize = 1

      setLoading('Compiling your submission')
      const rCode = compiler.compile(solution, optimize)
      const rCodeSolution = compiler.compile(codeSolution, optimize)
      // If code does not compile properly
      if (rCode.errors) {
        return callback(new Error(rCode.errors[0]))
      } else {
        const notDefined = Object.keys(rCodeSolution.contracts)
          .filter(name => {
            return rCode.contracts[name] === undefined
          }).map(name => {
            return name.substring(1)
          })

        if (notDefined.length > 0) {
          return callback(new Error('Contracts [' + notDefined.join(', ') + '] are not defined'))
        }
      }

      const addresses = []

      let index = 0
      // Deploy all contracts
      for (let name of Object.keys(rCode.contracts)) {
        name = name.substring(1)
        setLoading('Deploying ' + name + '\t ' + index++ + '/' + Object.keys(rCode.contracts).length)
        try {
          const dCode = await deploy(rCode.contracts[':' + name])
          addresses.push(dCode.address)
        } catch (error) {
          console.log(error)
          return callback(new Error('Deployment error for contract ' + name))
        }
      }

      setLoading('Testing')
      validation = JSON.parse(validation)

      let tests = true
      for (let index = 0; index < validation.length; index++) {
        const test = validation[index]

        const cTest = web3.eth.contract(JSON.parse(test.abi)).at(test.address)

        const r = await performTests(cTest, addresses)
        tests = tests && r.result
      }
      if (tests) {
        exerciseSuccess(id)
        return callback(null, 'Success')
      } else {
        return callback(new Error('Tests failed'))
      }
    }
  }

  const markSolvedExercise = ($exercise) => {
    $exercise.find('.header').text('Exercise (✔)')
  }

  // Bind an exercise
  // Add code editor, bind interactions
  const prepareExercise = ($exercise) => {
    const codeSolution = $exercise.find('.code-solution').text()
    const codeValidation = $exercise.find('.code-deployed').text()
    const codeExerciseId = JSON.parse($exercise.find('.code-exerciseId').text())
    const codeContext = $exercise.find('.code-context').text()

    hasExerciseBeenSolved(codeExerciseId)
      .then(solved => {
        if (solved) {
          markSolvedExercise($exercise)
        }
      })

    const editor = ace.edit($exercise.find('.editor').get(0))
    editor.setTheme('ace/theme/tomorrow')
    editor.getSession().setUseWorker(false)
    editor.getSession().setMode('ace/mode/javascript')

    editor.commands.addCommand({
      name: 'submit',
      bindKey: 'Ctrl-Return|Cmd-Return',
      exec: () => {
        $exercise.find('.action-submit').click()
      }
    })

    // Submit: test code
    $exercise.find('.action-submit').click(e => {
      e.preventDefault()

      gitbook.events.trigger('exercise.submit', {type: 'code'})

      setLoading('Loading...')
      $exercise.toggleClass('return-loading', true)
      $exercise.toggleClass('return-error', false)
      $exercise.toggleClass('return-success', false)
      execute('solidity', editor.getValue(), codeValidation, codeContext, codeSolution, codeExerciseId, (err, result) => {
        $exercise.toggleClass('return-loading', false)
        if (err) {
          $exercise.toggleClass('return-error', true)
          $exercise.find('.alert-danger').text(err.message || err)
        } else {
          $exercise.toggleClass('return-success', true)
          markSolvedExercise($exercise)
        }
      })
    })

    // Set solution
    $exercise.find('.action-solution').click(e => {
      e.preventDefault()

      editor.setValue(codeSolution)
      editor.gotoLine(0)
    })
  }

  // Prepare all exercise
  const init = () => {
    web3 = new Web3(web3.currentProvider)
    gitbook.state.$book.find('.exercise').each(function () {
      prepareExercise($(this))
    })
  }

  gitbook.events.bind('page.change', () => {
    init()
  })
})
