import dotenv from 'dotenv'

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'

dotenv.config({path: `./${envFile}`})

interface EnvConfig {
    PORT: number,
    REDIS_HOST: string,
    REDIS_PORT: string,
    REDIS_PASSWORD: string
}

const getEnvVariable = (key: keyof EnvConfig, defaultValue: string): string => {
    const value = process.env[key];
    if(!value && !defaultValue) {
        throw new Error(`Environment variable of ${key} is missing`)
    }
    return value != undefined ? value : defaultValue
}

const config: EnvConfig = {
    PORT: parseInt(getEnvVariable('PORT', '5000')),
    REDIS_HOST: getEnvVariable('REDIS_HOST', "redis"),
    REDIS_PORT: getEnvVariable('REDIS_PORT', "6379"),
    REDIS_PASSWORD: getEnvVariable('REDIS_PASSWORD', "undefined")
}

export default config



