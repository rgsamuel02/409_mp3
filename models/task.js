var mongoose = require('mongoose');

var TaskSchema = new mongoose.Schema({
    name: String,
    description: {
        type: String,
        default: ""
    },
    deadline: Date,
    completed: {
        type: Boolean,
        default: false
    },
    assignedUser: {
        type: String,
        default: ""
    },
    assignedUserName: {
        type: String,
        default: "unassigned"
    },
    dateCreated: {
        type: Date,
        default: Date.now,
        immutable: true
    }
});

module.exports = mongoose.model('Task', TaskSchema);
