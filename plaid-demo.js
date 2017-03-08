// SETTINGS
////////////////////////////////////////////////////////////////////////////////

// Your Client ID & Secret: https://dashboard.plaid.com/overview

const settings = {
  font: 'Big Money-ne',
  client_id: process.env.plaid_client_id,
  secret: process.env.plaid_secret,
  environment: 'tartan'
  // environment: 'production'
}

// Modules
////////////////////////////////////////////////////////////////////////////////

const path = require('path')

const plaid = require('plaid')
const chalk = require('chalk')
const jsonfile = require('jsonfile')
const Table = require('cli-table')
const figlet = require('figlet')

const Enquirer = require('enquirer')
const Question = require('prompt-question')
const PromptList = require('prompt-list')
const PromptPassword = require('prompt-password')

// SETUP
////////////////////////////////////////////////////////////////////////////////

jsonfile.spaces = 2

const enquirer = new Enquirer()
enquirer.register('list', require('prompt-list'))
enquirer.register('password', require('prompt-password'))

const plaid_env = plaid.environments[settings.environment]

// Initialize a Plaid client (your app is the Plaid client)
const plaid_client = new plaid.Client(
  settings.client_id,
  settings.secret,
  plaid_env
)

const WARNING_BANK_ACCESS_KEYS = path.join('.', 'WARNING_BANK_ACCESS_KEYS.json')
const data = jsonfile.readFileSync(WARNING_BANK_ACCESS_KEYS)

// PROGRAM
////////////////////////////////////////////////////////////////////////////////

const getExtendedInstitutions = () => new Promise((resolve, reject) => {
  const extendedInstitutionsFile = path.join('.', 'extended-institutions.json')
  const extendedInstitutions = jsonfile.readFileSync(extendedInstitutionsFile)

  const promises = [];

  extendedInstitutions.forEach(institutionId => {
    promises.push(new Promise((resolve, reject) => {
      plaid.getInstitution(institutionId, plaid_env, (err, res) => {
        if (err) {
          return reject(err)
        }
        resolve(res)
      })
    }))
  })

  Promise.all(promises).then(extendedInstitutions => {
    resolve(extendedInstitutions)
  }).catch(err => {
    reject(err)
  })
})

const getCommonInstitutions = extendedInstitutions => new Promise((resolve, reject) => {
  plaid.getInstitutions(plaid_env, (err, commonInstitutions) => {
    if (err) {
      return reject(err)
    }

    const institutions = extendedInstitutions.concat(commonInstitutions)

    resolve(institutions)
  });
})

const selectInstitution = institutions => new Promise((resolve, reject) => {
  const questionText = 'Select institution to access:'

  const institutionList = institutions.map(institution => institution.name)

  const question = new Question('institution', questionText, {
    type: 'list',
    choices: institutions
  })

  const prompt = new PromptList(question)

  prompt.run()
  .then(answer => resolve(
    institutions.find(institution => institution.name === answer)
  ))
  .catch(function(err) {
    return reject(err)
  })
})

const getAccountState = institution => new Promise((resolve, reject) => {
    const title = institution.name
    console.log('\n\n' + chalk.green(figlet.textSync(title, {font: settings.font})))

  if (Reflect.has(data, institution.type)) {
    const accountData = data[institution.type]

    console.log(chalk.green(`You HAVE connected to ${institution.name} previously.`))

    if (!accountData.stepped) {
      console.log(chalk.red(`You must complete an AUTH step to get data for ${institution.name}.`))
    }

    resolve({institution, accountData})
  } else {
    console.log(chalk.yellow(`You have NOT connected to ${institution.name} before.`))

    const accountData = ({
      connected: false,
      stepped: false,
      access_token: null
    })

    resolve({institution, accountData})
  }
})

const formatCurrency = (amount, type) => {
  const value = parseFloat(amount, 10)

  if (Number.isNaN(value)) {
    return amount || '';
  }

  let color
  const positive = value >=  0
  if (type = 'transaction') {
    color = positive ? 'red' : 'green'
  } else if (type === 'balance') {
    color = positive ? 'green' : 'red'
  }
  const locale = value.toLocaleString('en-US', {style: 'currency', currency: 'USD'})

  return `${chalk[color](locale)}`
}

const accountActions = [
  {
    text: 'Show current balance',
    method: 'getBalance',
    success: (institution, accountData, res) => new Promise ((resolve, reject) => {
      console.log(chalk.green(`${institution.name} Balance`))

      const table = new Table({
         style: {head: ['grey']},
        head: ['Name', 'Number', 'Balance', 'Available', 'Type'],
        colWidths: [28, 10, 16, 16, 12]
      })

      res.accounts.forEach((account, index)=> {
        table.push([
          account.meta.name,
          account.meta.number,
          formatCurrency(account.balance.current, 'balance'),
          formatCurrency(account.balance.available, 'balance'),
          account.type
        ])
      })

      const output = table.toString()
      resolve(output)
    })
  },

  {
    text: 'Show recent transactions (7 days)',
    method: 'getConnectUser',
    gte: '7 days ago',
    success: (institution, accountData, res) => new Promise ((resolve, reject) => {
      console.log(chalk.green(`${institution.name} Recent Transactions (7 days)`))
      console.log(chalk.grey(`You have ${res.transactions.length} transactions in the last 7 days.`));

      const table = new Table({
        style: {head: ['grey']},
        head: ['Date', 'Description', 'Amount'],
        colWidths: [12, 64, 12]
      })

      res.transactions.forEach((item, index)=> {
        table.push([
          item.date,
          chalk.italic(item.name),
          formatCurrency(item.amount, 'transaction')
        ])
      })

      const output = table.toString()
      resolve(output)
    })
  }
]

const chooseAccountAction = props => new Promise((resolve, reject) => {
  const {institution, accountData} = props

  const questionText = 'Select the action would you like to perform:'

  const actionList = accountActions.map(action => action.text)

  const question = new Question('action', questionText, {
    type: 'radio',
    choices: actionList
  })

  const prompt = new PromptList(question)

  prompt.run()
  .then(answer => {
    const action = accountActions.find(action => action.text === answer)
    resolve({institution, accountData, action})
  })
  .catch(function(err) {
    return reject(err)
  })
})

const performAccountAction = props => new Promise((resolve, reject) => {
  const {institution, accountData, action} = props

  const options = {}

  if (Reflect.has(action, 'gte')) {
    options.gte = action.gte
  }

  const callback = (err, res) => {
    if (err) {
      return reject(err)
    }

    return resolve(action.success(institution, accountData, res))
  }

  const hasOptions = JSON.stringify(options) !== "{}";

  // console.log(action.method)
  // console.log(accountData.access_token)
  // console.log(options)

  if (hasOptions) {
    plaid_client[action.method](accountData.access_token, options, callback)
  } else {
    plaid_client[action.method](accountData.access_token, callback)
  }
})

const getCredentials = institution => new Promise((resolve, reject) => {
  const questions = []

  Reflect.ownKeys(institution.credentials).forEach(key=> {
    const credentialName = institution.credentials[key]

    const question = {
      message: `${institution.name} ${credentialName}:`,
      name: key
    }

    if (key === 'password' || key === 'pin') {
      question.type = 'password'
    }

    questions.push(question)
  })

  enquirer.ask(questions).then(resolve).catch(reject)
})

const connectAccount = props => new Promise((resolve, reject) => {
  const {institution, accountData, credentials} = props

  // console.log(institution)
  // console.log(accountData)

  console.log(chalk.grey(`${chalk.italic('Connecting to')} ${institution.name}...`))

  plaid_client.addConnectUser(institution.type, credentials, null, (err, mfaResponse, response) => {
    if (err) {
      console.log(chalk.red.bold.underline(`${err.message.toUpperCase()}`))
      console.log(chalk.red.italic(`${err.resolve}`))
      console.log(chalk.red(`Code: ${err.code}`))
      return reject(err)
    }

    console.log(chalk.green('The connection to ${institution.name} was sucessful.'))

    // console.log(mfaResponse)
    // console.log(response)

    if (!accountData) {
      accountData = {}
    }

    if (mfaResponse) {
      accountData.connected = true
      accountData.mfaResponse = mfaResponse
      accountData.access_token = mfaResponse.access_token
    }

    if (response) {
      accountData.connected = true
      accountData.stepped = true
      accountData.access_token = response.access_token
    }

    // console.log()
    // console.log(accountData)

    // console.log()
    // console.log(JSON.stringify(data))

    data[institution.type] = accountData
    jsonfile.writeFileSync(WARNING_BANK_ACCESS_KEYS, data)
    resolve({institution, accountData})
  })
})

const authStep = props => new Promise((resolve, reject) => {
  const {institution, accountData} = props

  if (accountData.mfaResponse) {
    const mfaQuestion = accountData.mfaResponse.mfa[0].question
    const access_token = accountData.mfaResponse.access_token

    const question = {
      message: `${institution.name} > ${mfaQuestion}:`,
      name: 'mfaResponse'
    }

    enquirer.ask(question).then(answer => {
      plaid_client.stepConnectUser(access_token, answer.mfaResponse, (err, mfaResponse, response) => {
        if (err) {
          console.log(chalk.red.bold.underline(`${err.message.toUpperCase()}`))
          console.log(chalk.red.italic(`${err.resolve}`))
          console.log(chalk.red(`Code: ${err.code}`))
          return reject(err)
        }

        if (mfaResponse) {
          accountData.mfaResponse = mfaResponse
          data[institution.type] = accountData
          jsonfile.writeFileSync(WARNING_BANK_ACCESS_KEYS, data)

          return authStep({institution, accountData})
            .then(finalData => {
              resolve(finalData)
            }).catch(err => {
              reject(err)
            })
        } else if (response) {
          console.log(chalk.green(`Passed authorization steps for ${institution.name}.`))

          delete accountData.mfaResponse
          data[institution.type] = accountData
          jsonfile.writeFileSync(WARNING_BANK_ACCESS_KEYS, data)

          resolve({institution, accountData})
        }
        // else {
        //   resolve({institution, accountData})
        // }
      })
    })
    .catch(reject)
  } else {
    // Bypass (already auth'ed)
    console.log(chalk.yellow(`No additional authorization steps are currently required for ${institution.name}.`))
    resolve({institution, accountData})
  }
})

// EXECUTE
////////////////////////////////////////////////////////////////////////////////

getExtendedInstitutions()
.then(getCommonInstitutions)
.then(selectInstitution)
.then(getAccountState)
.then(props => new Promise((resolve, reject) => {
  const {institution, accountData} = props

  const ready = accountData.connected && accountData.stepped
  const needToConnect = !accountData.connected
  const needToStep = accountData.connected && !accountData.stepped

  if (ready) {
    return resolve({institution, accountData})
  }

  if (needToConnect) {
    getCredentials(institution)
    .then(credentials => new Promise((resolve, reject) => {
      return connectAccount({institution, accountData, credentials}).then(resolve).catch(reject)
    }))
    .then(authStep)
    .then(resolve)
    .catch(reject)
  }

  if (needToStep) {
    authStep({institution, accountData}).then(resolve).catch(err)
  }
}))
.then(chooseAccountAction)
.then(performAccountAction)
.then(console.log)
.catch(err => {
  console.log('\n----------------------')
  console.log(err)
  console.error(err.stack)
  throw err
})