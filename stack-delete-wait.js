isCloudbreakTag = function(namePrefix) {
    return function(tag) {
        return tag.Key === 'CloudbreakClusterName' && tag.Value === namePrefix
    }
}

isHDPCluster = function(namePrefix) {
    return function(stack) {
        return stack.Tags.filter(isCloudbreakTag(namePrefix)).length > 0
    }
}

wait = function() {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            resolve();
        }, 3000);
    })
}

deleteStacks = function(stacks) {
    return new Promise(function(resolve, reject) {
        Promise.all(stacks.map(deleteStack)).then(function() {
            console.log("Called delete on all stacks.")
            resolve()
        }).catch(function() {
            console.log("Delete call failed on one or more stacks.")
            reject()
        })
    })
}

deleteStack = function(stack) {
    return new Promise(function(resolve, reject) {
        var aws = require('aws-sdk');
        var cfn = new aws.CloudFormation();
        cfn.deleteStack({
            StackName: stack.StackName
        }, function(err, data) {
            if (err) {
                console.log("Delete failed:")
                console.log(err)
                reject()
            } else {
                console.log("Delete called successfully.")
                resolve()
            }
        });
    })
}

describeStacks = function(stacks) {
    return new Promise(function(resolve, reject) {
        wait().then(function() {
            Promise.all(stacks.map(describeStack)).then(function() {
                console.log("All stacks were deleted.")
                resolve()
            }).catch(function() {
                console.log("There are still running stacks.")
                reject()
            })
        })
    })
}

describeStack = function(stack) {
    return new Promise(function(resolve, reject) {
        var aws = require('aws-sdk');
        var cfn = new aws.CloudFormation();
        cfn.describeStacks({
            StackName: stack.StackName
        }, function(err, data) {
            if (err) {
                console.log("Describe failed:")
                console.log(err)
                resolve()
            } else {
                console.log("Describe was successful.")
                reject()
            }
        });
    })
}

pollUntilDeleted = function(stacks) {
    return describeStacks(stacks).then(function() {
        return "deleted"
    }).catch(function() {
        return pollUntilDeleted(stacks)
    })
}

exports.handler = function(event, context) {
    console.log('REQUEST RECEIVED:\\n', JSON.stringify(event));
    var clusterName = event.ResourceProperties.ClusterName;
    var response = require('cfn-response');
    var responseData = {};
    if (clusterName) {
        if (event.RequestType == 'Delete') {
            var aws = require('aws-sdk');
            var cfn = new aws.CloudFormation();
            cfn.describeStacks({}, function(err, data) {
                if (err) {
                    responseData = {
                        Error: 'DescribeStacks call failed'
                    };
                    console.log(responseData.Error + ':\\n', err);
                    response.send(event, context, response.FAILED, responseData);
                } else {
                    var stacks = data.Stacks.filter(isHDPCluster(clusterName))
                    console.log("Found " + stacks.length + " stacks.");
                    deleteStacks(stacks)
                        .then(function() {
                            return pollUntilDeleted(stacks)
                        })
                        .then(function(result) {
                            console.log("result:", result)
                            response.send(event, context, response.SUCCESS, responseData);
                        })
                        .catch(function() {
                            response.send(event, context, response.FAILED, responseData);  
                        })
                }
            });
            return;
        }
        if (event.RequestType == 'Create') {
            response.send(event, context, response.SUCCESS, responseData);
        }
    } else {
        responseData = {
            Error: 'Cluster name not specified'
        };
        console.log(responseData.Error);
        response.send(event, context, response.FAILED, responseData);
    }
}