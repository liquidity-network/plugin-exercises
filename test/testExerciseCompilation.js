const _ = require('lodash')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const server = require('../src/js/utils/server')
const tester = require('gitbook-tester')
const { JSDOM } = require('jsdom')

const encodeHtml = (str) => {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const trim = (str) => {
  return str.trim().split('\n').map(s => s.trim()).join('\n')
}

describe('Gitbook exercise integration test', function () {
  let exercise = {}
  it('should create an exercise with the proper template', function (done) {
    process.env.WRITE_MODE = true
    tester.builder()
      .withContent(`${exercise.file}`)
      .withLocalPlugin(path.join(__dirname, '..'))
      .create()
      .then(function (result) {
        const expected =
          _.template(fs.readFileSync(path.resolve(__dirname, '../assets/website.html')))({
            codes: {
              initial: encodeHtml(exercise.initial),
              solution: encodeHtml(exercise.solution),
              validation: encodeHtml(exercise.validation),
              deployed: JSON.stringify([]),
              exerciseId: -1
            },
            message: exercise.message
          })
        assert.equal(result[0].content, `<p>${expected}</p>`)
        done()
      }).catch((err) => {
        done(err)
      })
  })

  it('should create an exercise with the proper template, associating it with an address and an abi', function (done) {
    process.env.WRITE_MODE = false
    tester.builder()
      .withContent(`${exercise.file}`)
      .withLocalPlugin(path.join(__dirname, '..'))
      .create()
      .then(function (result) {
        const dom = new JSDOM(result[0].content)
        const codes = {
          message: dom.window.document.querySelector('.message').innerHTML,
          initial: dom.window.document.querySelector('.editor').innerHTML,
          solution: dom.window.document.querySelector('.code-solution').innerHTML,
          validation: dom.window.document.querySelector('.code-validation').innerHTML,
          deployed: JSON.parse(dom.window.document.querySelector('.code-deployed').innerHTML),
          exerciseId: JSON.parse(dom.window.document.querySelector('.code-exerciseId').innerHTML)
        }

        let exactMatch = ['message', 'initial', 'solution']
        exactMatch.map(key => {
          assert.strictEqual(trim(codes[key]), trim(exercise[key]))
        })
        codes.deployed.forEach(test => {
          assert.notStrictEqual(typeof test.abi, 'undefined')
          assert.notStrictEqual(typeof test.address, 'undefined')
        })
        // assert.notStrictEqual(codes.exerciseId, -1)

        done()
      }).catch((err) => {
        done(err)
      })
  })

  before(function () {
    server.listen()

    process.env.API_URL = 'http://localhost:3000'
    process.env.BLOCKCHAIN_PROVIDER = server.address
    process.env.PRIVATE_KEY = server.privateKey
    exercise.message = `Wording\n`
    exercise.initial = `pragma solidity ^0.4.24;

contract Contract {
  uint i = 0;

  // Increment function here
}`
    exercise.solution = `pragma solidity ^0.4.24;

contract Contract {
  uint private i = 0;

  function increment() public returns (uint) {
    // Don't care about overflow
    i = i + 1;
    return i;
  }
}`
    exercise.validation = `// Tests need proper pragma
pragma solidity ^0.4.24;

// Assert library is available here
import 'Assert.sol';
// Import contracts, filenames should match contract names given in the solution
import 'Contract.sol';

contract TestMuffin {
  // Declare variable associated to the contract you want to test
  // __ADDRESS__ specifies the contract is the one provided at runtime by the user
  Contract deployedContract = Contract(__ADDRESS__);

  // test function
  // IMPORTANT: only one assertion per function
  function testIncrement() public {
    uint result = deployedContract.increment();
    uint expected = 1;
    Assert.equal(result, expected, "Increment is not properly implemented");
  }

  // event to communicate with the web interface
  event TestEvent(bool indexed result, string message);
}`
    exercise.file = `
{% exercise %}
${exercise.message}

{% initial %}
${exercise.initial}

{% solution %}
${exercise.solution}

{% validation %}
${exercise.validation}

{% endexercise %}
`
  })

  after(function () {
    server.close()
  })
})
