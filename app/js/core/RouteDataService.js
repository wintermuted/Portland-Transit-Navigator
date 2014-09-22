/**
 * Created by jamesonnyeholt2 on 9/4/14.
 */

angular.module('pdxStreetcarApp')

    .service('RouteData', function ($q, $log, $rootScope, routeMapInstance, trimet, formatRetrievedRoutes, RouteColors) {

        "use strict";

        var self = this;

        self.geoJsonRouteData = null;
        self.streetcarData = null;
        self.maxRailData = null;
        self.busRoutesData = null;
        self.selectedRoute = null;

        self.routeLayers = {};
        self.stopMarkers = {};
        self.nearbyRoutes = {};
        self.routes = {};
        self.routesDisplayed = 0;

        self.selectedRouteStop = null;

        self.retrieveRouteGeoJson = function retrieveRouteGeoJson() {
            var deferred = $q.defer();

            if (self.geoJsonRouteData) {
                deferred.resolve(self.geoJsonRouteData);
            }

            $.ajax({
                type: 'GET',
                url: 'data/kml/tm_routes.kml'
            })
                .done(function (xml) {
                    var geoJson = toGeoJSON.kml(xml);
                    self.set(geoJson);
                    deferred.resolve(geoJson);
                });
            return deferred.promise;
        };

        self.set = function set(data) {
            self.geoJsonRouteData = data;
            return data;
        };

        self.clear = function clear() {
            self.geoJsonRouteData = null;
        };

        self.findFeature = function findFeature(routeId) {
            return _.forEach(self.geoJsonRouteData.features, function (route) {
                return parseInt(route.properties.route_number) === routeId;
            });
        };

        self.memoizeStopDataOnRoute = function memoizeStopData(data) {

            function findStopsForDirection(directionId) {
                var stops;
                _.forEach(data.resultSet.route[0].dir, function (direction) {
                    if (direction.dir === directionId) {
                        stops = direction.stop;
                    }
                });
                return stops;
            }

            function convertStopsArrayToDictionary(stops) {
                var stopsDictionary = {};
                _.forEach(stops, function (stop) {
                    if (!stopsDictionary[stop.locid]) {
                        stop.selected = false;
                        stopsDictionary[stop.locid] = stop;
                    }
                });

                return stopsDictionary;
            }

            var routeId = data.resultSet.route[0].route;

            _.forEach(self.routes[routeId].dir, function (direction) {
                var stops = findStopsForDirection(direction.dir);
                if (stops) {
                    direction.stop = convertStopsArrayToDictionary(stops);
                }
            });

            return self.routes[routeId];
        };

        self.memoizeRoute = function (data) {
            var route = data.resultSet.route[0];
            var routeId = route.route;
            if (!self.routes[routeId]) {
                self.routes[routeId] = route;
            }
            return data;
        };

        self.getRouteData = function (routeId) {
            // TODO: make sure that routes and nearbyRoutes have data in them at this point
            return trimet.getRouteById(routeId)
                .then(self.memoizeRoute)
                .then(self.memoizeStopDataOnRoute)
                .then(function (data) {
                    self.selectedRoute = self.routes[routeId];
                    return self.selectedRoute;
                });
        };

        self.selectRouteStop = function (stop) {

            if (self.selectedRouteStop) {
                _.forEach(self.selectedRoute.dir, function (direction) {
                    if (direction.stops[self.selectedRouteStop.locid]) {
                        direction.stops[self.selectedRouteStop.locid].selected = false;
                    }
                });
            }

            _.forEach(self.selectedRoute.dir, function (direction) {
                if (direction.stops[stop.locid]) {
                    direction.stops[stop.locid].selected = true;
                    self.selectedRouteStop = stop;
                    return;
                }
            });

            return self.selectedRoute;
        };

        self.memoizeNearbyRoutes = function (data) {
            _.forEach(data.resultSet.location, function (stop) {
                _.forEach(stop.route, function (route) {
                    if (!self.routes[route.route]) {
                        self.routes[route.route] = route;
                    }
                });
            });
        };

        function compriseFeatureCollection(feature) {
            var featureCollection = {
                "type": "FeatureCollection",
                "features": []
            };
            featureCollection.features.push(feature);
            return featureCollection;
        }

        function determineRouteColor(routeId) {
            if (RouteColors[routeId]) {
                return RouteColors[routeId];
            } else {
                return RouteColors.BUS;
            }
        }

        self.initRouteLineDisplay = function (routeId, directionId) {
            var featureCollection,
                layer;

            function routeHoveredOnMap(data) {
                $rootScope.$broadcast('routeHoveredFromMap', data);
            }

            function routeSelectedOnMap(data) {
                $rootScope.$broadcast('routeSelectedFromMap', data);
            }

            function setRouteMouseOverEvent() {
                routeMapInstance.map.data.addListener('mouseover', function (event) {
                    routeMapInstance.map.data.revertStyle();
                    routeMapInstance.map.data.overrideStyle(event.feature, {strokeWeight: 8});
                    var value = event.feature.getProperty('route_number');
                    routeHoveredOnMap(value);
                });
            }

            function setRouteMouseOutEvent() {
                routeMapInstance.map.data.addListener('mouseout', function (event) {
                    routeMapInstance.map.data.revertStyle();
                });
            }

            function setRouteClickEvent() {
                routeMapInstance.map.data.addListener('click', function (event) {
                    if (event.alreadyCalled_) {
                        return;
                    } else {
                        var value = event.feature.getProperty('route_number');
                        routeMapInstance.map.data.revertStyle();
                        routeMapInstance.map.data.overrideStyle(event.feature, {
                            strokeColor: 'red',
                            strokeWeight: 8
                        });
                        routeSelectedOnMap(value);
                        event.alreadyCalled_ = true;
                    }
                });
            }

            function setRouteStyles() {
                routeMapInstance.map.data.setStyle(function (feature) {
                    var routeId = feature.getProperty('route_number');
                    var color = determineRouteColor(routeId);

                    return {
                        strokeColor: '#' + color,
                        strokeWeight: 4
                    };
                });


            }

            _.forEach(self.geoJsonRouteData.features, function (feature) {
                if (parseInt(feature.properties.route_number) === routeId) {
                    if (parseInt(feature.properties.direction) === directionId) {
                        featureCollection = compriseFeatureCollection(feature);
                        layer = routeMapInstance.map.data.addGeoJson(featureCollection);
                        setRouteStyles();
                        setRouteMouseOverEvent();
                        setRouteMouseOutEvent();
                        setRouteClickEvent();
                        self.memoizeRouteLayer(routeId, layer, feature);
                    }
                }
            });
        };

        self.enableRoute = function (route) {
            if (!self.stopMarkers[route.routeId]) {
                self.stopMarkers[route.routeId] = {};
            }
            if (!self.stopMarkers[route.routeId][route.directionId]) {
                self.initRouteLineDisplay(route.routeId, route.directionId);
            }
            if (route.enabled === true) {
                route.enabled = false;
            } else if (route.enabled === false) {
                route.enabled = true;
            }
        };

        self.streetCar = function () {

            var defer = $q.defer();

            if (self.streetcarData) {
                defer.resolve(self.streetcarData);
            }

            return trimet.streetcar.getRoutes()
                .then(formatRetrievedRoutes)
                .then(function (result) {
                    self.streetcarData = result;
                    return result;
                });
        };

        self.bus = function () {

            var defer = $q.defer();

            if (self.busRoutesData) {
                defer.resolve(self.busRoutesData);
            }

            return trimet.bus.getRoutes()
                .then(formatRetrievedRoutes)
                .then(function (result) {
                    self.busRoutesData = result;
                    return result;
                });
        };

        self.trimet = function () {

            var defer = $q.defer();

            if (self.maxRailData) {
                defer.resolve(self.maxRailData);
            }

            return trimet.rail.getRoutes()
                .then(formatRetrievedRoutes)
                .then(function (result) {
                    self.maxRailData = result;
                    return result;
                });
        };

        self.selectRoute = function (route) {

            function triggerClickEventOnRouteLayer(route) {
                var routeLayer = self.routeLayers[route.route];
                google.maps.event.trigger(routeLayer.standard[0].layer, 'click');
            }

            function checkIfRouteIsMemoized(route) {
                return self.routeLayers[route.route];
            }

            if (!checkIfRouteIsMemoized(route)) {
                self.initRouteLineDisplay(route.route);
            }
            //triggerClickEventOnRouteLayer(route);
        };

        // Nearby Routes

        self.clearNearbyRoutes = function () {
            if (!_.isEmpty(self.routeLayers)) {
                _.forEach(self.routeLayers, function (route, routeKey) {
                    _.forEach(route, function (directions, directionKey) {
                        self.clearRouteLayerOnMap(directions.layer[0]);
                        delete self.routeLayers[routeKey][directionKey];
                    });
                });
            }
            self.routeLayers = {};
        };

        self.memoizeRouteLayer = function (routeId, layer, feature) {
            var directionId = parseInt(feature.properties.direction);
            var frequent = feature.properties.frequent;

            if (!self.routeLayers[routeId]) {
                self.routeLayers[routeId] = {
                    standard: {},
                    frequent: {}
                };
            }

            if (frequent == 'True') {
                self.routeLayers[routeId].frequent[directionId] = {
                    enabled: true,
                    directionId: directionId,
                    layer: layer,
                    feature: feature
                };
            } else if (frequent == 'False') {
                self.routeLayers[routeId].standard[directionId] = {
                    enabled: true,
                    directionId: directionId,
                    layer: layer,
                    feature: feature
                };
            }

            return layer;
        };

        function getMemoizedRoute(routeId, directionId) {
            if (self.routeLayers[routeId]) {
                return self.routeLayers[routeId].standard[directionId] || self.routeLayers[routeId].frequent[directionId];
            }
            return;
        }

        self.showRouteLayer = function (routeId, directionId) {

            var route;

            function addRouteLayerToMap(featureCollection) {
                return routeMapInstance.map.data.addGeoJson(featureCollection);
            }

            function enableMemoizedRoute(route, routeId) {
                var layer,
                    featureCollection;

                    featureCollection = compriseFeatureCollection(route.feature);
                    layer = addRouteLayerToMap(featureCollection);
                    self.memoizeRouteLayer(routeId, layer, route.feature);
                    route.enabled = false;
            }

            function enableNewRoute (routeId, directionId) {
                var layer;

                _.forEach(self.geoJsonRouteData.features, function (feature) {
                    if (parseInt(feature.properties.route_number) === routeId) {
                        if (parseInt(feature.properties.direction) === directionId) {
                            layer = addRouteLayerToMap(feature);
                            self.memoizeRouteLayer(routeId, layer, feature);
                        }
                    }
                });
            }

            route = getMemoizedRoute(routeId, directionId);

            if (route) {
                enableMemoizedRoute(route, routeId);
            } else {
                enableNewRoute(routeId, directionId);
            }

        };

        self.hideRouteLayer = function (routeId, directionId) {
            var route;

            function setRouteLayerToDisabled(dir) {
                if (dir.enabled && dir.enabled === true) {
                    dir.enabled = false;
                }
            }

            route = getMemoizedRoute(routeId, directionId);

            if (route) {
                self.clearRouteLayerOnMap(route.layer[0]);
                setRouteLayerToDisabled(route);
            } else {
                $log.error('Route ' + routeId + ' could not be found.  An error occurred.');
            }
        };

        self.clearRouteLayerOnMap = function (layer) {
            return routeMapInstance.map.data.remove(layer);
        };

        self.clearRouteLayersOnMap = function (routeId, directionId) {
            var route,
                direction;

            function setRouteLayerToDisabled(dir) {
                if (dir.enabled && dir.enabled === true) {
                    dir.enabled = false;
                }
            }

            if (self.routeLayers[routeId]) {
                route = self.routeLayers[routeId];
                if (route.frequent && route.frequent[directionId]) {
                    direction = route.frequent[directionId];
                    self.clearRouteLayerOnMap(direction.layer[0]);
                    setRouteLayerToDisabled(direction);
                }
                if (route.standard && route.standard[directionId]) {
                    direction = route.standard[directionId];
                    self.clearRouteLayerOnMap(direction.layer[0]);
                    setRouteLayerToDisabled(direction);
                }
            }
        };

        self.reconcileAlreadyEnabledRoutes = function (source, routes) {

            function checkIfRouteLayerIsEnabled(route, routeId) {
                var routeLayerInstance = self.routeLayers[routeId];

                function enableRouteOnList(directionId) {
                    _.forEach(route.directions, function (direction) {
                        if (direction.directionId === directionId) {
                            direction.enabled = true;
                        }
                    });
                }

                if (routeLayerInstance) {
                    _.forEach(routeLayerInstance, function (direction) {
                        if (direction.enabled === true) {
                            enableRouteOnList(direction.directionId);
                        }
                    });
                }
            }

            _.forEach(routes, function (route, routeId) {
                checkIfRouteLayerIsEnabled(route, routeId);
            });

            return routes;
        };

    });
