/* global BrowserSolc, web3, XMLHttpRequest */

const { jQuery: $, ace, Web3 } = window

require(['gitbook'], (gitbook) => {
  /**
   * @type {string} apiURL - Http address to call to get users or exercises data
   */
  const apiURL = 'https://achievement.network/api'

  let fetchUser = () => {
    return new Promise((resolve, reject) => {
      if (typeof window.user !== 'undefined') {
        window.user.then(user => { resolve(user) })
        return
      }
      setTimeout(() => { fetchUser().then(user => { resolve(user) }) }, 200)
    })
  }

  /**
   * @type {Promise<Object>} user - Logged in user
   */
  let user = fetchUser()

  /**
   * @type {{solidity: {id: string}}} LANGUAGES - Languages that can compile
   */
  const LANGUAGES = {
    'solidity': {
      id: 'solidity'
    }
  }

  /**
   * @dev max doesn't work because the string are treated in their lexicographical order
   * @returns {Promise<string>} - identifier of the last stable version of the solidity compiler
   */
  const lastCompilerVersion = () => {
    return new Promise((resolve, reject) => {
      BrowserSolc.getVersions((nigthlies, stables) => {
        const version =
          Object.keys(stables).reduce((last, current) => {
            return (
              last.split('.').reduce((acc, s) => {
                return acc * 100 + parseInt(s)
              }, 0) -
              current.split('.').reduce((acc, s) => {
                return acc * 100 + parseInt(s)
              }, 0) > 0 ? last : current
            )
          })
        resolve(stables[version])
      })
    })
  }

  /**
   * @type {Object} currentCompiler - loaded compiler
   */
  let currentCompiler

  /**
   * Retrieve given version of the solidity compiler
   * @param {string} version - identifier of the version (e.g. soljson-v0.4.23+commit.124ca40d.js)
   * @returns {Promise<Object>} - Compiler object
   */
  const loadCompiler = (version) => {
    return new Promise(async resolve => {
      if (currentCompiler === undefined) {
        BrowserSolc.loadVersion(version, compiler => {
          currentCompiler = compiler
          resolve(compiler)
        })
      } else {
        resolve(currentCompiler)
      }
    })
  }

  /**
   * Retrieve the last version of the solidity compiler
   * @returns {Promise<Object>}
   */
  const loadLastCompiler = async () => {
    const lastVersion = await lastCompilerVersion()
    return loadCompiler(lastVersion)
  }

  /**
   * Set the message for the loading bar
   * @param {string} message - message to set
   */
  const setLoading = (bar, message) => {
    bar.text(message)
  }

  /**
   * Estimate the gas of a transaction with the given data
   * @param {string} data - Raw data passed to the transaction
   * @returns {Promise<int>} - Estimated gas
   */
  const estimateGas = (data) => {
    return new Promise(resolve => {
      web3.eth.estimateGas({data: data}, (err, r) => {
        if (err) { console.log(err); return }
        resolve(r)
      })
    })
  }

  /**
   * Estimate the current gas price
   * @returns {Promise<int>} - Estimated gas price
   */
  const estimateGasPrice = () => {
    return new Promise(resolve => {
      web3.eth.getGasPrice((err, r) => {
        if (err) { console.log(err); return }
        resolve(r)
      })
    })
  }

  /**
   * Deploy the contract onto the blockchain using web3 provided by Metamask
   * @param {Object} contract - Contract to deploy
   * @returns {Promise<string>} - Address where the contract has been deployed
   */
  const deploy = (contract) => {
    const abi = contract.interface
    const bc = '0x' + contract.bytecode
    const mcontract = web3.eth.contract(JSON.parse(abi))
    return new Promise(async (resolve, reject) => {
      const estimate = await estimateGas(bc)
      const gasPrice = await estimateGasPrice()
      // TODO: ...[constructorParameter1, constructorParameter2]
      mcontract.new({data: bc, from: web3.eth.accounts[0], gas: estimate, gasPrice: gasPrice}, (err, r) => {
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
  }

  /**
   * Listen for new events of a test contract and resolve when all tests have passed or if one has failed
   * @param {{TestEvent: function}} contract - Test contracts
   * @param addresses - Addresses of the deployed contracts
   * @returns {Promise<{result: boolean, errors: Array<string>}>} - True if the tests have passed
   */
  const performTests = (contract, addresses, progress) => {
    let result = true
    const errors = []
    let resultReceived = 0

    return new Promise(async resolve => {
      // Listen for transaction results
      contract.TestEvent((err, r) => {
        resultReceived++
        progress(`Test ${resultReceived}/${contract.abi.length - 1}`)
        result = result && r.args.result
        if (!r.args.result) {
          errors.push(r.args.message)
        }
        // Resolve only after all test results
        if (resultReceived === contract.abi.length - 1) {
          resolve({ result: result, errors: errors })
        }
      })

      // Perform a transaction for every function to test
      let fTests = contract.abi
        .filter(c => { return c.type === 'function' })
        .sort((a, b) => { return a.name > b.name })
      for (let iTest = 0; iTest < fTests.length; iTest++) {
        progress(`Test ${0}/${contract.abi.length - 1}`)
        const test = fTests[iTest]
        const gasPrice = await estimateGasPrice()
        let txParams = { gasPrice: gasPrice }
        if (contract.abi.filter(t => t.name === test.name).payable === true) {
          txParams.value = web3.toWei('0.002', 'ether')
        }
        contract[test.name](addresses, txParams, (err, r) => { if (err) { errors.push(err) } })
      }

      // If contract.abi has only TestEvent or nothing
      if (contract.abi.length <= 1) {
        resolve({ result: true, errors: [] })
      }
    })
  }

  /**
   * Save the user progression and validation of the exercise
   * @param {int} id - id of the exercise to validate
   */
  const exerciseSuccess = (id) => {
    if (typeof window.user === 'undefined') {
      return
    }

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

  /**
   * Check if the user has passed a given exercise
   * @param {int} id - id of the exercise to check
   * @returns {Promise<boolean>} - True if exercise has been solved
   */
  const hasExerciseBeenSolved = async (id) => {
    let u = await user
    return u !== undefined && u.exercises.includes(id)
  }

  /**
   * Replace all `msg.sender` instance by the user address
   * @param {string} str - code to modify
   * @returns {string} - code without msg.sender
   * @dev this step is necessary for some tests because the sender is the test contract
   */
  function replaceMsgSender (str) {
    return str.replace(/msg\.sender/g, web3.eth.accounts[0])
  }

  /**
   * Execute the process to run an exercise
   * @param {string} lang - Language the code is written in
   * @param {string} solution - Solution of the exercise TODO: depreciate it
   * @param {string} validation - Abi and addresses of the deployed tests to call
   * @param {string} context - Environement to test with
   * @param {string} codeSolution - Code provided by the user to solve the exercise
   * @param {int} id - Id of the current exercise
   * @param {function} callback - Tells the browser if the exercise has succeeded or not
   * @returns {Promise<*>}
   */
  const execute = async (lang, solution, validation, context, codeSolution, id, progress, callback) => {
    // Language data
    const langd = LANGUAGES[lang]

    // Check language is supported
    if (!langd) return callback(new Error('Language `' + lang + '` not available for execution'))
    if (langd.id === 'solidity') {
      progress('Loading compiler')
      const compiler = await loadLastCompiler()
      const optimize = 1

      progress('Compiling your submission')

      // If there is a msg.sender, it should be equal to the address of the user
      solution = replaceMsgSender(solution)

      const rCode = compiler.compile(solution, optimize)
      const rCodeSolution = compiler.compile(codeSolution, optimize)
      // If code does not compile properly
      if (rCode.errors) {
        return callback(new Error(rCode.errors[0]))
      } else {
        const notDefined =
          Object.keys(rCodeSolution.contracts)
            .filter(name => {
              return rCode.contracts[name] === undefined
            }).map(name => {
              return name.substring(1)
            })

        if (notDefined.length > 0) {
          return callback(new Error(`Contracts [${notDefined.join(', ')}] are not defined`))
        }
      }

      const addresses = []

      let index = 0
      // Deploy all contracts
      for (let name of Object.keys(rCode.contracts)) {
        name = name.substring(1)
        progress(`Deploying ${name}'\t${index++}/${Object.keys(rCode.contracts).length}`)
        try {
          const dCode = await deploy(rCode.contracts[':' + name])
          window.dCode = dCode
          addresses.push(dCode.address)
        } catch (error) {
          console.log(error)
          return callback(new Error(`Deployment error for contract ${name}`))
        }
      }

      progress('Testing')
      validation = JSON.parse(validation)

      let tests = true
      let errors = ''
      for (let index = 0; index < validation.length; index++) {
        const test = validation[index]

        const cTest = web3.eth.contract(JSON.parse(test.abi)).at(test.address)

        const r = await performTests(cTest, addresses, progress)
        tests = tests && r.result
        errors += r.errors.join('\n')
      }
      if (tests) {
        exerciseSuccess(id)
        return callback(null, 'Success')
      } else {
        return callback(new Error(errors))
      }
    }
  }

  /**
   * Add a distinctive checkmark to tell an exercise has been solved
   * @param {Object} $exercise - jQuery exercise div to mark
   */
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
    const progress = (message) => { return setLoading($exercise.find('#loading-message'), message) }

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
    $exercise.find('.action-submit').click(async (e) => {
      e.preventDefault()

      // Forbid submission if web3 is not properly configured
      const checkWeb3 = await checkWeb3Network(true)
      if (checkWeb3 === false) {
        return
      }

      gitbook.events.trigger('exercise.submit', {type: 'code'})

      progress('Loading...')
      $exercise.toggleClass('loading', true)
      $exercise.toggleClass('return-error', false)
      $exercise.toggleClass('return-success', false)
      execute('solidity', editor.getValue(), codeValidation, codeContext, codeSolution, codeExerciseId, progress, (err, result) => {
        $exercise.toggleClass('loading', false)
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

  /**
   * Display the modal window with a title and an html message. If title === 'Hide', hide the window immediately
   * @param {string} title - Header of the modal window
   * @param {string} message - Message to display. HTML formatted
   * @param {boolean} remind - has the message already been displayed
   */
  const modalMessage = (title, message, remind = false) => {
    if (remind === false) {
      return
    }

    const modal = document.getElementById('myModal')
    const span = document.getElementsByClassName('close')[0]
    const header = document.getElementsByClassName('modal-header')[0].firstElementChild
    const text = document.getElementsByClassName('modal-message')[0]

    header.innerHTML = title
    text.innerHTML = message

    span.onclick = () => {
      modal.style.display = 'none'
    }

    window.onclick = (event) => {
      if (event.target === modal) {
        modal.style.display = 'none'
      }
    }

    if (title === 'Hide') {
      modal.style.display = 'none'
    } else {
      modal.style.display = 'block'
    }
  }

  /**
   * Check if web3 is properly configured. If not, it prompt a modal window with information on how to configure it
   * @returns {Promise<boolean>} - Is web3 properly configured
   */
  const checkWeb3Network = (remind = false) => {
    return new Promise((resolve, reject) => {
      if (typeof web3 === 'undefined') {
        modalMessage('Please install Metamask', 'We weren\' able to detect your Metamask installation. You can go to our tutorial by click the button below', remind)
        resolve(false)
        return
      }
      web3 = new Web3(web3.currentProvider)
      if (web3.eth.accounts.length === 0) {
        modalMessage('Please unlock Metamask', '<img width="100%" src="/gitbook/gitbook-plugin-exercises/tutorials/unlock_metamask.gif"/>', remind)
        resolve(false)
        return
      }
      if (window.location.hostname === 'localhost') {
        resolve(true)
        return
      }

      web3.version.getNetwork((err, netId) => {
        switch (netId) {
          case '806':
            // User on our network, nothing to do
            modalMessage('Hide')
            resolve(true)
            break
          default:
            modalMessage('Select https://net.achievement.network on Metamask', '<img width="100%" src="/gitbook/gitbook-plugin-exercises/tutorials/change_network.gif"/>', remind)
            resolve(false)
        }
      })
    })
  }

  /**
   * Insert metamask logo inside the header
   */
  // eslint-disable-next-line no-unused-vars
  const insertMetamaskLogo = () => {
    const MetamaskLogo = require('metamask-logo')

    const viewer = MetamaskLogo({
      pxNotRatio: true,
      width: 50,
      height: 40,
      followMouse: true,
      slowDrift: false
    })

    document.getElementsByClassName('metamask-logo-container')[0]
      .appendChild(viewer.container)
  }

  /**
   * Prepare all exercises
   */
  const init = () => {
    if (document.getElementsByClassName('exercise').length === 0) {
      return
    }

    checkWeb3Network(true).then(() => {
      setInterval(checkWeb3Network, 100)
    })
    gitbook.state.$book.find('.exercise').each(function () {
      prepareExercise($(this))
    })
  }

  gitbook.events.bind('page.change', () => {
    init()
  })
})
