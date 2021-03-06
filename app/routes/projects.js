/**
 * Author: krasu
 * Date: 8/17/13
 * Time: 11:09 PM
 */
var _ = require('lodash'),
	https = require('https'),
	async = require('async'),
	mongoose = require('mongoose'),
	ensureAuthenticated = require('../utils/ensure-auth'),
	sendProjectMessage = require('../utils/send-project-email'),
	User = mongoose.model('User'),
	Support = mongoose.model('Support'),
	Project = mongoose.model('Project'),
	Request = mongoose.model('Request')


module.exports = function (app) {
	app.post('/projects/comment-for-author', function (req, res) {
		var data = req.body.projectData || {}
		data._id = req.body.project

		sendProjectMessage(data,
			req.body.message,
			req.user,
			'comment-for-author',
			function (project) {
				return [
					'Comment from',
					(req.user ? req.user.username : 'anonymous'),
					'for your project ',
					project.owner.username + ' / ' + project.name
				].join(' ')
			},
			function (error) {
				if (error) return res.send(400, 'Failed to send your email')

				res.send('ok')
			})
	});

	app.post('/projects/donate-request', function (req, res) {
		var requestData = {
			projectGitId: req.body.projectData && req.body.projectData.githubId
		}
		var emailData = req.body.projectData || {}
		var isAnonym = !!req.user

		emailData._id = req.body.project
		if (req.user) requestData['user'] = req.user._id
		if (req.body.project) requestData['project'] = req.body.project

		async.parallel([
			function (callback) {
				var request = new Request(requestData)
				request.save(callback)
			},
			function (callback) {
				sendProjectMessage(emailData,
					'',
					req.user,
					'request-contribution',
					function (project) {
						return [
							'Contribution request from',
							(isAnonym ? req.user.username : 'anonymous'),
							'for your project ',
							project.owner.username + ' / ' + project.name
						].join(' ')
					},
					callback)
			}
		], function (error) {
			if (error) {
				console.error(error)
				return res.send(500, 'failed')
			}
			res.send('request accepted')
		})
	})

	app.get('/projects/:id', function (req, res) {
		if (!req.param('id')) return res.send(400, 'empty request')

		Project.findById(req.param('id'), function (err, project) {
			if (err) return res.send(400, err);

			async.parallel({
				supporting: function (cb) {
					Support.find({byProject: project._id}).populate('project').exec(cb)
				}
//				supporters: function (cb) {
//					Support.find({project: project._id, supporting: true, type: 'user'}).populate('byUser').exec(cb)
//				},
//				contributors: function (cb) {
//					Support.find({project: project._id, contributing: true, type: 'user'}).populate('byUser').exec(cb)
//				},
//				donators: function (cb) {
//					Support.find({project: project._id, donating: true, type: 'user'}).populate('byUser').exec(cb)
//				},
//				userSupport: function (cb) {
//					if (!req.user) return cb(null, {})
//					Support.findOne({project: project._id, byUser: req.user._id, type: 'user'}).exec(cb)
//				}
			}, function (error, result) {
				if (error) return res.send(500, err)

				res.render('project', {
					supporting: result.supporting,
					project: project,
					users: _.pick(result, 'supporters', 'contributors', 'donators'),
					userSupport: result.userSupport || {}
				})
			})
		})
	})

	app.get('/projects/:id/subscribe/:type(supporting|donating|contributing)/:state', ensureAuthenticated, function (req, res) {
		var type = req.param('type')
		var id = req.param('id')
		if (!type || !id) return res.send(500, 'empty request')

		var data = {}
		data[type] = req.param('state') == 'true'

		Project.findById(id, function (err) {
			if (err) return res.send(400, 'project not found');

			Support.updateEntry(req.user, 'user', req.user._id, id, data, function (err) {
				if (err) return res.send(500, 'Failed to update your support')
				res.send('ok')
			})
		})
	})
};
