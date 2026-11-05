/*
 * Connect all of your endpoints together here.
 */

module.exports = function (app, router) {

    // Register the home route
    require('./home.js')(router);

    // Register the user routes
    require('./users.js')(router);

    // Mount all routes under /api
    app.use('/api', router);

    return app;
};
