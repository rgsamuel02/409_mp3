module.exports = function (router) {

    var homeRoute = router.route('/');

    homeRoute.get(function (req, res) {
        var connectionString = process.env.TOKEN;
        res.json({ message: 'MP3 API is running' });
    });

    return router;
}
