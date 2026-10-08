export default {
    development: {
        type: 'development',
        port: 3000,
        mongodb: process.env.MONGODB_URI
    },
    production: {
        type: 'production',
        port: 3000,
        mongodb: process.env.MONGODB_URI
    }
};
