import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import UsersModel from '../models/users.mjs';
import { validateRequestBody } from '../validation.mjs';
import { sendInternalServerError } from '../errors.mjs';

const Auth = class Auth {
    constructor(app, jwtSecret) {
        this.app = app;
        this.jwtSecret = jwtSecret;
        this.run();
    }

    login() {
        this.app.post('/auth/login', async (req, res) => {
            if (!validateRequestBody(req, res, {
                email: { type: 'string', required: true },
                password: { type: 'string', required: true }
            })) {
                return;
            }

            try {
                const { email, password } = req.body;
                const invalidEmail = !validator.isEmail(email.trim());
                const passwordTooLong = Buffer.byteLength(password, 'utf8') > 72;

                if (invalidEmail || passwordTooLong) {
                    return res.status(400).json({
                        code: 400,
                        message: 'Validation failed',
                        errors: [
                            ...(invalidEmail ? [{
                                field: 'email',
                                message: 'Must be a valid email address'
                            }] : []),
                            ...(passwordTooLong ? [{
                                field: 'password',
                                message: 'Must not exceed 72 bytes'
                            }] : [])
                        ]
                    });
                }

                const user = await UsersModel.findOne({
                    email: email.trim().toLowerCase()
                }).select('+password');

                if (!user || !(await bcrypt.compare(password, user.password))) {
                    return res.status(401).json({
                        code: 401,
                        message: 'Invalid email or password'
                    });
                }

                const token = jwt.sign(
                    { sub: user.id },
                    this.jwtSecret,
                    { expiresIn: '1h' }
                );

                res.status(200).json({
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        age: user.age
                    }
                });
            } catch (err) {
                sendInternalServerError(err, res);
            }
        });
    }

    run() {
        this.login();
    }
};

export default Auth;
