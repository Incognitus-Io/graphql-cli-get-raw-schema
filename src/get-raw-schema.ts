export const command = 'get-raw-schema [endpoint]'
export const desc = 'Download schema from endpoint'
export const builder = {
  watch: {
    alias: 'w',
    boolean: true,
    description: 'watch server for schema changes and update local schema',
  },
}

import { existsSync, writeFileSync } from 'fs'
import { relative } from 'path'
import { printSchema } from 'graphql'
import { writeSchema } from 'graphql-config'
import * as chalk from 'chalk'

export const noEndpointError = new Error(
  `You don't have any enpoint in your .graphqlconfig.
Run ${chalk.yellow('graphql add-endpoint')} to add endpoint to your config`)

export const introspectionQuery = `
{
	"query": "{  __schema {  queryType { name },  mutationType { name },  subscriptionType { name },  types{  ...FullType  },  directives{  name,  description,  locations,  args{  ...InputValue  }  }  } },   fragment FullType on __Type{  kind,  name,  description,  fields(includeDeprecated: true){  name,  description,  args{  ...InputValue  },  type{  ...TypeRef  },  isDeprecated,  deprecationReason  },  inputFields{  ...InputValue  },  interfaces{  ...TypeRef  },  enumValues(includeDeprecated: true){  name,  description,  isDeprecated,  deprecationReason  },  possibleTypes{  ...TypeRef  } },   fragment InputValue on __InputValue{  name,  description,  type{ ...TypeRef },  defaultValue },   fragment TypeRef on __Type{  kind,  name,  ofType{  kind,  name,  ofType{  kind,  name,  ofType{  kind,  name,  ofType{  kind,  name,  ofType{  kind , name,  ofType{  kind , name,  ofType{  kind,  name  }  }  }  }  }  }  } }"
}`

export async function handler (context: any, argv: { endpointName: string, watch: boolean }) {
  if (argv.watch) {
    const spinner = context.spinner
    // FIXME: stop spinner on errors
    spinner.start()
    const spinnerLog = msg => spinner.text = msg

    while (true) {
      const isUpdated = await update(spinnerLog)
      if (isUpdated) {
        spinner.stop()
        console.log(spinner.text)
        spinner.start()
        spinner.text = 'Updated!'
      } else {
        spinner.text = 'No changes.'
      }

      spinner.text += ' Next update in 10s.'
      await wait(10000)
    }
  } else {
    return await update(console.log)
  }

  async function update (log: (message: string) => void) {
    const config = context.getProjectConfig()
    if (!config.endpointsExtension) {
      throw noEndpointError
    }
    const endpoint = config.endpointsExtension.getEndpoint(argv.endpointName)

    log(`Downloading introspection from ${chalk.blue(endpoint.url)}`)
    const newSchema = await endpoint.resolveSchema()

    try {
      const oldSchemaSDL = config.getSchemaSDL()
      const newSchemaSDL = printSchema(newSchema)
      if (newSchemaSDL === oldSchemaSDL) {
        log(chalk.green('No changes'))
        return false
      }
    } catch (e) {
      /* noop */
    }

    const newSchemaJson = await fetch(endpoint.url, {method: 'POST', body: introspectionQuery})
      .then(res => res.text())

    let schemaFile = config.schemaPath as string
    schemaFile = `${schemaFile.slice(0, schemaFile.lastIndexOf('.'))}.json`
    const schemaPath = relative(process.cwd(), schemaFile)

    writeFileSync(schemaPath, newSchemaJson)

    const existed = existsSync(schemaPath)
    log(chalk.green(`Schema file was ${existed ? 'updated' : 'created'}: ${chalk.blue(schemaPath)}`))
    return true
  }
}

function wait (interval: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => resolve(), interval)
  })
}
