import UsersModel from '../models/users.mjs';
import { getMongooseValidationErrors, validateRequestBody } from '../validation.mjs';
import { sendInternalServerError } from '../errors.mjs';

const Users = class Users {
    constructor(app, connect, authToken){
        this.app = app;
        this.connect = connect;
        this.authToken = authToken;
        this.run();
    }

    getUsersById() {
        this.app.get('/users/:id', this.authToken, async (req, res) => {
            try {
                const id = req.params.id;
                const user = await UsersModel.findById(id);

                if (!user) {
                    return res.status(404).json({
                        code: 404,
                        message: "User not found"
                    });
                }

                res.status(200).json(user);
            } catch (err) {
                sendInternalServerError(err, res);
            }
        });

    }

    getUsers() {
        this.app.get('/users', this.authToken, async (req, res) => {
            try {
                const users = await UsersModel.find();
                res.status(200).json(users);
            } catch (err) {
                sendInternalServerError(err, res);
            }
        });

    }

    createUser() {
        this.app.post('/users', async (req, res) => {
            if (!validateRequestBody(req, res, {
                firstname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                lastname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                age: { type: 'number', required: true },
                email: { type: 'string', required: true, maxLength: 254 },
                password: { type: 'string', required: true, minLength: 8 }
            })) {
                return;
            }

            try {
                const { firstname, lastname, age, email, password } = req.body;

                if (Buffer.byteLength(password, 'utf8') > 72) {
                    return res.status(400).json({
                        code: 400,
                        message: 'Validation failed',
                        errors: [{
                            field: 'password',
                            message: 'Must not exceed 72 bytes'
                        }]
                    });
                }

                const user = await UsersModel.create({
                    firstname,
                    lastname,
                    age,
                    email,
                    password
                });

                res.status(201).json({
                    id: user.id,
                    firstname: user.firstname,
                    lastname: user.lastname,
                    age: user.age,
                    email: user.email,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                });
            } catch (err) {
                const validationErrors = getMongooseValidationErrors(err);
                if (validationErrors) {
                    return res.status(400).json({
                        code: 400,
                        message: 'Validation failed',
                        errors: validationErrors
                    });
                }

                if (err.code === 11000) {
                    return res.status(409).json({
                        code: 409,
                        message: 'An account with this email already exists'
                    });
                }

                sendInternalServerError(err, res);
            }
        });
    }

    updateUserById() {
        this.app.put('/users/:id', this.authToken, async (req, res) => {
            if (!validateRequestBody(req, res, {
                firstname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                lastname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                age: { type: 'number', required: true }
            })) {
                return;
            }

            try {
                const id = req.params.id;
                const { firstname, lastname, age } = req.body;

                const user = await UsersModel.findByIdAndUpdate(
                    id,
                    { firstname, lastname, age },
                    { new: true, runValidators: true }
                );

                if (!user) {
                    return res.status(404).json({
                        code: 404,
                        message: "User not found"
                    });
                }

                res.status(200).json(user);
            } catch (err) {
                const validationErrors = getMongooseValidationErrors(err);
                if (validationErrors) {
                    return res.status(400).json({
                        code: 400,
                        message: 'Validation failed',
                        errors: validationErrors
                    });
                }

                sendInternalServerError(err, res);
            }
        });

    }

    deleteUserById() {
        this.app.delete('/users/:id', this.authToken, async (req, res) => {
            try {
                const id = req.params.id;
                const user = await UsersModel.findByIdAndDelete(id);

                if (!user) {
                    return res.status(404).json({
                        code: 404,
                        message: "User not found"
                    });
                }

                res.status(200).json(user);
            } catch (err) {
                sendInternalServerError(err, res);
            }
        });

    }

    run() {
        this.getUsersById();
        this.getUsers();
        this.createUser();
        this.updateUserById();
        this.deleteUserById();
    }
};

export default Users;