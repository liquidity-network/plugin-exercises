const _ = require('lodash')
const solc = require('solc')
const linker = require('solc/linker')
const builder = require('./builder')
const blockchain = require('./blockchain')
const database = require('./database')

/**
 * First deploy the Assert library to the blockchain, then deploy all tests to the blockchain
 * @dev it could be optimized by deploying the Assert library
 * @param {{contracts: Array<{interace: string}>}} codes - Solidity compiler output
 * @param {Array<string>} toDeploy - Name of contracts to be deployed
 * @param {string} assertLibraryAddress - Address where the Assert library has been deployed
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function deployTests (codes, toDeploy, assertLibraryAddress) {
  const tests = []

  for (const key of toDeploy) {
    // Link test with the already deployed assert library

    codes.contracts[key].bytecode =
      linker.linkBytecode(
        codes.contracts[key].bytecode,
        {'Assert.sol:Assert': assertLibraryAddress}
        //{'Assert.sol:Assert': '0x722B2E46213bBDa00aef72e084cCd2AB7168938C'}
      )
    // Deploy the test
    const address = await blockchain.deploy(codes.contracts[key])
    tests.push({
      address: address,
      abi: codes.contracts[key].interface
    })
  }

  return tests
}

/**
 * Compile and deploy all test of the exercise
 * @param {{solution: string, validation: string, exerciseId: int}} codes - Raw solidity code from the exercise, @param{solution} is the solution provided by the tester and will help to build a generic interface of all solution, @param{validation} is the code for all the tests
 * @param {{address: string, source: string}} assertLibrary - Solidity file of the Assert library
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function compileAndDeploy (codes, assertLibrary) {
  // Check if exercise is unchanged
  let storedExercise = {}
  try {
    storedExercise = await database.getExercise(codes.solution)
  } catch (err) {
    console.log('Exercise not found in the database')
  }
  if (storedExercise.id) {
    codes.exerciseId = storedExercise.id
    return storedExercise.abi
      .map((value, index) => {
        return {
          abi: value,
          address: storedExercise.addresses[index]
        }
      })
  }

  // Compile the solution
  const cSolution = solc.compile({sources: {'solution.sol': codes.solution}}, 1)

  if (cSolution.errors && !cSolution.errors.reduce((acc, e) => { return acc && !e.includes('Error') }, true)) {
    throw new Error(`Solution did not compile properly \n ${cSolution.errors}`)
  }

  if (cSolution.errors) {
    // Display warnings if any
    console.log(cSolution.errors)
  }

  // Create an interface for every contract the user will code
  const interfaces = builder.createInterfaces(cSolution)
  const names = interfaces.map(function (snip) {
    return snip.name
  })

  // Make test available for any user-specified contract
  codes.validation = builder.transformSolidityTest(codes.validation, names)

  // Compile interfaces, assert library and test code
  const input = interfaces.reduce(function (acc, inter) {
    const m = {}
    m[inter.name + '.sol'] = inter.code
    return _.extend(acc, m)
  }, {})
  input['Assert.sol'] = assertLibrary.source
  input['test.sol'] = codes.validation

  const cTests = solc.compile({sources: input}, 1)

  if (cTests.errors) {
    throw new Error('Compilation failed\n' + cTests.errors.join('\n'))
  }

  // Deployment

  // Remaining contracts to deploy (i.e. tests)
  const toDeploy = Object.keys(cTests.contracts)
    .filter((key) => {
      return key.startsWith('test.sol')
    })

  // It should be possible to deploy contracts asynchronously
  const tests = await deployTests(cTests, toDeploy, assertLibrary.address)
  // Register the exercise into the database

  try {
    codes.exerciseId = await database.register(codes.solution, tests.map(test => test.address), tests.map(test => test.abi))
  } catch (err) {
    codes.exerciseId = -1
  }
  return tests
}

module.exports = compileAndDeploy
