import path from 'path'
import requireFromString from 'require-from-string'
import chalk from 'chalk'
import { version } from './package.json'
import esbuild from 'esbuild'
import t, { Infer } from 'myzod'
import fs from 'fs'
import { QuartzPlugin } from '@jackyzha0/quartz-plugins'
import { ComponentType } from 'react'

export interface UserProvidedConfig {
  quartzVersion: string,
  name: string,
}

const configSchema = t.object({
  quartzVersion: t.string(),
  name: t.string(),
  ignorePatterns: t.array(t.string()),
})

export interface QuartzConfig {
  plugins: QuartzPlugin[],
  configuration: Infer<typeof configSchema>,
  components: {
    pageSingle: ComponentType,
    pageList: ComponentType,
    pageHome: ComponentType,
    document: ComponentType
  }
}

function isValidConfig(cfg: any): cfg is QuartzConfig {
  const requiredKeys = ["plugins", "configuration", "components"]
  for (const key of requiredKeys) {
    if (!cfg.hasOwnProperty(key)) {
      console.log(`${chalk.yellow("Warning:")} Configuration is missing required key \`${key}\``)
      return false
    }
  }

  const requiredComponents = ["pageSingle", "pageList", "pageHome", "document"]
  for (const key of requiredComponents) {
    if (!cfg.components.hasOwnProperty(key)) {
      console.log(`${chalk.yellow("Warning:")} Configuration is missing required component \`${key}\``)
      return false
    }
  }

  const validationResult = configSchema.try(cfg.configuration)
  if (validationResult instanceof t.ValidationError) {
    console.log(`${chalk.yellow("Warning:")} Configuration doens't match schema. ${validationResult.message}`)
    return false
  }

  return true
}

export const QUARTZ = "quartz"
export const QUARTZ_CONFIG_NAME = "quartz.config.js"

export function getQuartzPath(directory: string) {
  return path.resolve(path.join(directory, QUARTZ))
}

export function getConfigFilePath(directory: string) {
  return path.resolve(path.join(directory, QUARTZ, QUARTZ_CONFIG_NAME))
}

export async function readConfigFile(directory: string): Promise<QuartzConfig> {
  const fp = path.resolve(path.join(directory, QUARTZ, QUARTZ_CONFIG_NAME))

  if (!fs.existsSync(fp)) {
    console.error(`${chalk.red("Couldn't find Quartz configuration:")} ${fp}`)
    console.log("hint: you can initialize a new Quartz with `quartz new`")
    process.exit(1)
  }

  const out = await esbuild.build({
    entryPoints: [fp],
    write: false,
    bundle: true,
    platform: "node",
    jsx: "automatic"
  }).catch(err => {
    console.error(`${chalk.red("Couldn't parse Quartz configuration:")} ${fp}`)
    console.log(`Reason: ${chalk.grey(err)}`)
    console.log("hint: make sure all the required dependencies are installed (run `npm install` in the `quartz` folder)")
    process.exit(1)
  })

  const mod = out.outputFiles![0].text
  const cfg: QuartzConfig = requireFromString(mod, fp).default
  if (!isValidConfig(cfg)) {
    console.error(chalk.red("Invalid Quartz configuration"))
    process.exit(1)
  }

  if (cfg.configuration.quartzVersion !== version) {
    console.log(`${chalk.yellow("Warning:")} version in configuration (${cfg.configuration.quartzVersion}) is different from current Quartz version (${version}). Proceed with caution!`)
    console.log("hint: visit https://github.com/jackyzha0/quartz/blob/v4/config.ts to see the most up-to-date schema")
  }

  return cfg
}

export async function templateQuartzFolder(directory: string, cfg: UserProvidedConfig) {
  const parentFolder = path.join(__dirname, "template")
  const quartzDirectory = getQuartzPath(directory)
  await fs.promises.cp(parentFolder, quartzDirectory, { recursive: true })

  // template quartz.config.js
  const configFilePath = getConfigFilePath(directory)
  const buf = await fs.promises.readFile(configFilePath)
  let s = buf.toString()

  for (const [k, v] of Object.entries(cfg)) {
    s = s.replace(`{{${k}}}`, v)
  }
  await fs.promises.writeFile(configFilePath, s)
}