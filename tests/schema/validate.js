'use strict'

const fs = require('fs')
const path = require('path')
const Ajv = require('ajv').default
const addFormats = require('ajv-formats').default

const ajv = new Ajv({ strict: true, allErrors: true })
addFormats(ajv)

const schemaPath = path.resolve(__dirname, 'claim.schema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const validate = ajv.compile(schema)

const claimsDir = path.resolve(__dirname, '../../src/_data/claims')

if (!fs.existsSync(claimsDir)) {
  console.log('No claims directory; skipping.')
  process.exit(0)
}

const files = fs.readdirSync(claimsDir).filter((f) => f.endsWith('.json'))

if (files.length === 0) {
  console.log('No claim files; skipping.')
  process.exit(0)
}

let failures = 0

for (const file of files) {
  const filePath = path.join(claimsDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  if (!validate(data)) {
    console.error(`FAIL  ${file}`)
    for (const err of validate.errors) {
      console.error(`      ${err.instancePath || '(root)'} — ${err.message}`)
    }
    failures++
  } else {
    console.log(`OK    ${file}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} claim file(s) failed validation.`)
  process.exit(1)
}

console.log(`\nAll ${files.length} claim(s) valid.`)
