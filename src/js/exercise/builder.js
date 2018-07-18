/**
 * Reduce long spaces to only one space character
 * @param {string} str - string to transform
 * @returns {string} - string without long spaces
 */
function removeLongSpace (str) {
  return str.replace(/ +/g, ' ')
}

function abiToSignature (abi) {
  return [
    abi.type,
    abi.name,
    '(' + abi.inputs.map(input => {
      return input.type + ' ' + input.name
    }).join(', ') + ')',
    (abi.stateMutability && abi.stateMutability !== 'nonpayable' ? abi.stateMutability : ''),
    (abi.type === 'function' ? 'external' : ''),
    ((abi.outputs && abi.outputs.length > 0)
      ? 'returns (' + abi.outputs.map(output => {
        return `${output.type}${output.name !== '' ? ' ' + output.name : ''}`
      }).join(', ') + ')' : ''),
    (abi.anonymous ? 'anonymous' : ''),
    ';'
  ].join(' ')
}

/**
 * From a standard solidity compiler JSON output, create the corresponding solidity interface in Solidity
 * @dev Should go in its own npm package
 * @param {string} name - name of the interface
 * @param {Object} interfaceJSON - interface described with standard solidify compiler JSON output
 * @returns {string} - interface written in solidity
 */
function parseSolidityJSON (name, interfaceJSON) {
  let interfaceTxt = `pragma solidity ^0.4.24;\ninterface ${name} {\n`

  interfaceJSON.sort((a, b) => {
    if (typeof a.name === 'undefined' || typeof b.name === 'undefined') {
      return typeof a.name === 'undefined'
    }
    if (a.name < b.name) {
      return -1
    }
    if (a.name > b.name) {
      return 1
    }
    return 0
  })

  // Transform all element into the abi to their matching signature
  interfaceTxt +=
    interfaceJSON.filter(obj => {
      return ['function', 'event'].includes(obj.type)
    }).map(abiToSignature).join('\n')

  interfaceTxt += '\n}'

  return removeLongSpace(interfaceTxt)
}

/**
 * From a public function returns its new version, where contracts are bind from user input
 * @dev function name ( ...args, address[] _addresses ) public { ...(Var let = _addresses[i];) _name(...args, ...(vars)); }
 * @param {string} name - name of the function
 * @param {Array<{type: string, name: string}>} args - arguments of the function
 * @param {Array<{type: string, name: string}>} variables - variables of the contracts
 * @param {boolean} isPayable - is function to transform payable
 * @returns {string} - new public function
 */
function buildPublicFunctionForTransform (name, args, variables, isPayable) {
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
    (isPayable ? 'payable' : ''),
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
      const split = arg.trim().split(' ')
      return {
        type: split[0],
        name: split[1]
      }
    })
  } else {
    args = []
  }

  const isPayable = line.indexOf(' payable ') >= 0

  let parameters = args.concat(variables)

  // Create new public function
  let result = buildPublicFunctionForTransform(name, args, variables, isPayable)

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

  // TODO: for all functions, put their signature on one line
  let variables = []
  test = test.split('\n').map(line => {
    return line.trim()
  })
  for (let line of test) {
    let contractType = contracts.reduce(
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
