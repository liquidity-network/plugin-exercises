const request = require('request')
const crypto = require('crypto')

const url = process.env.API_URL

// eslint-disable-next-line no-unused-vars
function getExercise (solution) {
  const hash = crypto.createHash('sha256').update(solution).digest('hex')

  return new Promise((resolve, reject) => {
    request.get({
      url: `${url}/exercises/${hash}`,
      json: true
    }, function (error, response, data) {
      if (error) {
        console.log('Error:', error)
      } else if (response.statusCode !== 200) {
        console.log('Status:', response.statusCode)
      } else {
        resolve(data)
      }
    })
  })
}

function createExercise (hash, addresses) {
  return new Promise((resolve, reject) => {
    request.post({
      url: `${url}/exercises`,
      json: true,
      form: {
        hash: hash,
        addresses: JSON.stringify(addresses)
      }
    }, function (error, response, data) {
      if (error) {
        reject(error)
      } else if (response.statusCode !== 200) {
        reject(response.statusCode)
      } else {
        resolve(data.id)
      }
    })
  })
}

async function register (solution, addresses) {
  // Hash of the solution serves as a unique identifier of the exercise
  const hash = crypto.createHash('sha256').update(solution).digest('hex')

  // Put the exercise into the database
  return createExercise(hash, addresses)
}

module.exports = {
  getExercise: getExercise,
  register: register
}
