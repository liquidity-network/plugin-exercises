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
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function deployTests (codes, toDeploy) {
  const tests = []

  // First deploy assert library
  const assertAddress = await blockchain.deploy(codes.contracts['Assert.sol:Assert'])

  for (const key of toDeploy) {
    // Link test with the already deployed assert library
    codes.contracts[key].bytecode =
      linker.linkBytecode(
        codes.contracts[key].bytecode,
        {'Assert.sol:Assert': assertAddress}
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
 * @param {{solution: string, validation: string}} codes - Raw solidity code from the exercise, @param{solution} is the solution provided by the tester and will help to build a generic interface of all solution, @param{validation} is the code for all the tests
 * @param {string} assertLibrary - Solidity file of the Assert library
 * @returns {Array<{address: string, abi: string}>} - All tests information: abi and address
 */
async function compileAndDeploy (codes, assertLibrary) {
  // Compile the solution
  const cSolution = solc.compile({sources: {'solution.sol': codes.solution}}, 1)

  // Create an interface for every contract the user will code
  const interfaces = builder.createInterfaces(cSolution)
  const names = interfaces.map(function (snip) {
    return snip.name
  })

  // Make test available for any user-specified contract
  codes.validation = builder.transformSolidityTest(codes.validation, names)

  // Compile interfaces, assert library and test code
  const input = _.reduce(interfaces, function (acc, inter) {
    const m = {}
    m[inter.name + '.sol'] = inter.code
    return _.extend(acc, m)
  }, {})
  input['Assert.sol'] = assertLibrary
  input['test.sol'] = codes.validation

  const cTests = solc.compile({sources: input}, 1)

  if (cTests.errors) {
    throw new Error('Compilation failed\n' + cTests.errors.join('\n'))
  }

  // Deployment

  // Remaining contracts to deploy (i.e. tests)
  const toDeploy = Object.keys(cTests.contracts)
    .filter(function (key) {
      return key.startsWith('test.sol')
    })

  // It should be possible to deploy contracts asynchronously
  const tests = await deployTests(cTests, toDeploy)

  // Register the exercise into the database
  const exerciseId = await database.register(codes.solution, tests.map(test => test.address))
  codes.exerciseId = exerciseId

  return tests
}

module.exports = compileAndDeploy
