var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {

    // GET all users
    router.route('/users').get(async function (req, res) {
        try {
            var users = await User.find();
            res.status(200).json({
                message: 'Users retrieved successfully',
                data: users
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving users',
                data: null
            });
        }
    });

    // GET one user
    router.route('/users/:id').get(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            res.status(200).json({
                message: 'User retrieved successfully',
                data: user
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving user',
                data: null
            });
        }
    });

    // POST create user
    router.route('/users').post(async function (req, res) {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({
                    message: 'Name and email are required',
                    data: null
                });
            }

            var user = new User({
                name: req.body.name,
                email: req.body.email,
                pendingTasks: []
            });

            await user.save();

            res.status(201).json({
                message: 'User created successfully',
                data: user
            });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            if (err.name === 'ValidationError') {
                return res.status(400).json({
                    message: err.message,
                    data: null
                });
            }

            res.status(500).json({
                message: 'Error creating user',
                data: null
            });
        }
    });

    // PUT update user
    router.route('/users/:id').put(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            if (typeof req.body.name !== 'string' || !req.body.name.trim() ||
                typeof req.body.email !== 'string' || !req.body.email.trim()) {
                return res.status(400).json({
                    message: 'Name and email are required',
                    data: null
                });
            }

            // Check for duplicate email
            var duplicate = await User.findOne({
                email: req.body.email,
                _id: { $ne: user._id }
            });

            if (duplicate) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            var oldName = user.name;

            // Replace editable fields
            user.name = req.body.name;
            user.email = req.body.email;
            user.pendingTasks = Array.isArray(req.body.pendingTasks)
                ? req.body.pendingTasks
                : [];

            // Never change dateCreated
            await user.save();

            // Update task names if the user was renamed
            if (oldName !== user.name) {
                await Task.updateMany(
                    { assignedUser: user._id.toString() },
                    { $set: { assignedUserName: user.name } }
                );
            }

            res.status(200).json({
                message: 'User updated successfully',
                data: user
            });
        } catch (err) {
            if (err.code === 11000 || err.name === 'ValidationError') {
                return res.status(400).json({
                    message: err.message || 'Invalid user information',
                    data: null
                });
            }

            res.status(500).json({
                message: 'Error updating user',
                data: null
            });
        }
    });

    // DELETE user
    router.route('/users/:id').delete(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            // Unassign all tasks belonging to this user
            await Task.updateMany(
                { assignedUser: user._id.toString() },
                {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                }
            );

            await User.findByIdAndDelete(user._id);

            res.status(200).json({
                message: 'User deleted successfully',
                data: user
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error deleting user',
                data: null
            });
        }
    });

    return router;
};