import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';

import routes from './controllers/routes.mjs'
import config from './config.mjs';
import jwt from 'jsonwebtoken';
import { handleExpressError } from './errors.mjs';

const Server = class Server {
    constructor() {
        this.app = express();
        this.config = config[process.argv[2]] || config.development
        this.jwtSecret = process.env.JWT_SECRET;

        if (
            typeof this.jwtSecret !== 'string' ||
            Buffer.byteLength(this.jwtSecret, 'utf8') < 32
        ) {
            throw new Error('JWT_SECRET must be set to at least 32 bytes before starting the API');
        }
    }

    async dbconnect() {
        try {
            const host = this.config.mongodb;

            await mongoose.connect(host);

            this.connect = mongoose.connection;

            const close = () => {
                this.connect.close((error) => {
                    if (error) {
                        console.error('Error closing database connection:', error);
                    } else {
                        console.log('Database connection closed successfully');
                    }
                });
            }

            this.connect.on('connected', () => {
                console.log('Database connected successfully');
            });

            this.connect.on('error', () => {
                setTimeout(() => {
                    console.error('Database connection error; retrying');
                    this.connect = this.dbconnect();
                }, 5000);
            });

            this.connect.on('disconnected', () => {
                setTimeout(() => {
                    console.error('Database disconnected; retrying');
                    this.connect = this.dbconnect();
                }, 5000);
            });

            process.on('SIGINT', () => {
                close();
                process.exit(0);
            });


        } catch (err) {
            console.error(`Database connection failed (${err?.name || 'Error'})`);
        }
  
    }

    authToken(req, res, next) {
        const authorization = req.headers.authorization;
        const [scheme, token, ...extra] = authorization?.split(' ') ?? [];

        if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
            return res.status(401).json({
                code: 401,
                message: 'A valid Bearer token is required'
            });
        }

        jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }, (err, payload) => {
            if (err) {
                return res.status(401).json({
                    code: 401,
                    message: 'Invalid or expired token'
                });
            }

            req.auth = payload;
            next();
        });
    }

    middleware() {
        this.app.use(helmet());
        this.app.use(cors({ origin: 'http://localhost:5173' }));
        this.app.use(rateLimit({
            windowMs: 60 * 60 * 1000,
            limit: 100,
            standardHeaders: true,
            legacyHeaders: false,
            message: {
                code: 429,
                message: 'Too many requests. Please try again later.'
            }
        }));
        this.app.use(express.json());
        this.app.use(express.urlencoded({extended: true}));
    }

    routes () {
        new routes.Auth(this.app, this.jwtSecret);
        new routes.Users(this.app, this.connect, this.authToken.bind(this));
        // Billetterie : l'achat d'un billet par une personne extérieure est public
        new routes.Tickets(this.app, this.authToken.bind(this));
        this.app.use([
            '/groups', '/group',
            '/events', '/event',
            '/thread',
            '/albums', '/album',
            '/poll'
        ], this.authToken.bind(this));
        new routes.Groups(this.app);
        new routes.Events(this.app);
        new routes.Threads(this.app);
        new routes.Albums(this.app);
        new routes.Photos(this.app);
        new routes.Polls(this.app);
        new routes.ShoppingItems(this.app);
        new routes.Carpools(this.app);

        this.app.use((req,res) =>  {
            res.status(404).json({
                code: 404,
                message: "Not Found"
            });
        });
        this.app.use(handleExpressError);
    }

    async run() {
        try {
            await this.dbconnect();
            this.middleware();
            this.routes();
            const keyPath = process.env.TLS_KEY_PATH || new URL('../certs/localhost-key.pem', import.meta.url);
            const certPath = process.env.TLS_CERT_PATH || new URL('../certs/localhost-cert.pem', import.meta.url);

            createServer({
                key: readFileSync(keyPath),
                cert: readFileSync(certPath)
            }, this.app).listen(this.config.port, () => {
                console.log(`HTTPS API listening on port ${this.config.port}`);
            });
        } catch(err) {
            console.error(`Failed to start HTTPS API (${err?.name || 'Error'})`);
        }
    }
};

export default Server;