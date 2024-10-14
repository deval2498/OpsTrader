import dotenv from 'dotenv'

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'

dotenv.config({path: `./${envFile}`})

interface EnvConfig {
    PORT: number
}

const getEnvVariable = (key: keyof EnvConfig, defaultValue?: string): string => {
    const value = process.env[key];
    if(!value || !defaultValue) {
        throw new Error(`Environment variable of ${key} is missing`)
    }
    return value || defaultValue
}

const config: EnvConfig = {
    PORT: parseInt(getEnvVariable('PORT', '5000'))
}

export default config



