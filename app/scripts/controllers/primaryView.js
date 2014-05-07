'use strict';
angular.module('pdxStreetcarApp')
    .controller('PrimaryViewCtrl', function ($scope, $stateParams) {
        $scope.selectedLine = $stateParams.line;
        $scope.isRouteSelected = function (route) {
            if ($scope.selectedRoute && route) {
                return route.route === $stateParams.line;
            }
        };
    });
