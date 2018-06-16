let _ = require('lodash')

/**
 * Reduce long spaces to only one space character
 * @param {string} str - string to transform
 * @returns {string} - string without long spaces
 */
function removeLongSpace (str) {
  return str.replace(/ +/g, ' ')
}

/**
 * From a standard solidity compiler JSON output, create the corresponding solidity interface in Solidity
 * @dev Should go in its own npm package
 * @param {string} name - name of the interface
 * @param {Object} interfaceJSON - interface described with standard solidify compiler JSON output
 * @returns {string} - interface written in solidity
 */
function parseSolidityJSON (name, interfaceJSON) {
  let interfaceTxt = 'pragma solidity ^0.4.24;\ninterface ' + name + ' {\n'

  interfaceTxt +=
    interfaceJSON.filter(obj => {
      return obj.type === 'function'
    }).map(function (obj) {
      return [
        obj.type,
        obj.name,
        '(' + obj.inputs.map(input => {
          return input.type + ' ' + input.name
        }).join(', ') + ')',
        'external',
        (obj.payable ? 'payable' : ''),
        (obj.outputs
          ? ' returns (' + obj.outputs.map(output => {
            return `${output.type}${output.name !== '' ? ' ' + output.name : ''}`
          }).join(', ') + ')' : ''),
        ';'
      ].join(' ')
    }).join('\n')

  interfaceTxt += '\n}'

  return removeLongSpace(interfaceTxt)
}

/**
 * From a public function returns its new version, where contracts are bind from user input
 * @dev function name ( ...args, address[] _addresses ) public { ...(Var let = _addresses[i];) _name(...args, ...(vars)); }
 * @param {string} name - name of the function
 * @param {Array<{type: string, name: string}>} args - arguments of the function
 * @param {Array<{type: string, name: string}>} variables - variables of the contracts
 * @returns {string} - new public function
 */
function buildPublicFunctionForTransform (name, args, variables) {
  return [
    'function',
    name,
    '(',
    (args > 0 ? args.map(v => {
      return v.type + ' ' + v.name
    }).join(',') : ''),
    (args > 0 ? ', ' : ''),
    'address[] _addresses',
    ')',
    'public',
    '{',
    variables.map((v, index) => {
      return [v.type, v.name, '=', v.type, '(_addresses[', index, '])'].join(' ')
    }).join(';') + ';',
    '_' + name,
    '(',
    variables.map(v => {
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
function transformFunction (line, variables) {
  let signature = line.replace(new RegExp(', ', 'g'), ',').split(' ')[1]
  let name = signature.split('(')[0]
  let args = signature.split('(')[1].slice(0, -1) // arguments of the function, slice to remove ending ')'
  if (args) {
    args = args.split(',').map(arg => {
      arg = arg.trim().split(' ')
      return {
        type: arg[0],
        name: arg[1]
      }
    })
  } else {
    args = []
  }

  let parameters = args.concat(variables)

  // Create new public function
  let result = buildPublicFunctionForTransform(name, args, variables)

  // Old function to private one
  result += [
    'function',
    '_' + name,
    '(',
    parameters.map(v => {
      return v.type + ' ' + v.name
    }).join(', '),
    ')',
    'private',
    '{'
  ].join(' ')

  return result
}

/**
 * From a standard truffle test makes abstract the contract to make it testable with different versions
 * @param test - test file as a string
 * @param {Array<string>} contracts - array containing names of the contracts
 * @returns {string} - transformed test file for compilation
 */
function transformSolidityTest (test, contracts) {
  let result = ''

  let variables = []
  test = test.split('\n').map(line => {
    return line.trim()
  })
  for (let line of test) {
    let contractType = _.reduce(
      contracts,
      (acc, name) => {
        return ((!acc && line.startsWith(name)) ? name : acc)
      },
      ''
    )
    if (contractType) {
      let name = line.split(' ')[1]
      variables.push({
        type: contractType,
        name: (name.endsWith(';') ? name.slice(0, -1) : name)
      })
    } else if (line.startsWith('function')) {
      result += transformFunction(line, variables)
    } else {
      result += line + '\n'
    }
  }

  return removeLongSpace(result)
}

/**
 * Given the compiled version of contracts, create their associated solidity interface
 * @dev Should this function return an object to keep the interface associated with its name?
 * @param {{contracts: Array<{interace: string}>}} codes - Solidity compiler output
 * @returns {Array<{name: string, code: string}>} - All tests interfaces
 */
function createInterfaces (codes) {
  return Object.keys(codes.contracts).map((fullname) => {
    let name = (new RegExp('([^:]+)$')).exec(fullname)[0].trim()
    let interfaceStr = codes.contracts[fullname].interface
    return {
      name: name,
      code: parseSolidityJSON(name, JSON.parse(interfaceStr))
    }
  })
}

module.exports = {
  createInterfaces: createInterfaces,
  parseSolidityJSON: parseSolidityJSON,
  transformSolidityTest: transformSolidityTest
}
