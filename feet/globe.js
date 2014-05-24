/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Modified by foreverbell<dql.foreverbell@gmail.com> to use it in
 * the project follow-my-feet.
*/

var DAT = DAT || {};

DAT.Globe = function(container, opts) {
	opts = opts || {};

	var colorFn = opts.colorFn || function(x) {
		var c = new THREE.Color();
		c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );
		return c;
	};
	var imgDir = opts.imgDir || '/feet/';

	var Shaders = {
		'earth' : {
			uniforms: {
				'texture': { type: 't', value: null }
			},
			vertexShader: [
				'varying vec3 vNormal;',
				'varying vec2 vUv;',
				'void main() {',
				'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
				'vNormal = normalize( normalMatrix * normal );',
				'vUv = uv;',
				'}'
			].join('\n'),
			fragmentShader: [
				'uniform sampler2D texture;',
				'varying vec3 vNormal;',
				'varying vec2 vUv;',
				'void main() {',
				'vec3 diffuse = texture2D( texture, vUv ).xyz;',
				'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
				'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
				'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
				'}'
			].join('\n')
		},
		'atmosphere' : {
			uniforms: {},
			vertexShader: [
				'varying vec3 vNormal;',
				'void main() {',
				'vNormal = normalize( normalMatrix * normal );',
				'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
				'}'
			].join('\n'),
			fragmentShader: [
				'varying vec3 vNormal;',
				'void main() {',
				'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
				'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
				'}'
			].join('\n')
		}
	};

	var camera, scene, renderer, w, h;
	var mesh, atmosphere, point;
	var sphereGeo, textGeo;
	var projector;

	var overRenderer;

	var curZoomSpeed = 0;
	var zoomSpeed = 50;

	var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
	var rotation = { x: 0, y: 0 },
	target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
	targetOnDown = { x: 0, y: 0 };

	var distance = 100000, distanceTarget = 100000;
	var padding = 40;
	var PI_HALF = Math.PI / 2;

	var cities = [], activeCity = -1;

	var mouseDownOn = false;
	var timer;

	function init() {

		container.style.color = '#fff';
		container.style.font = '13px/20px Arial, sans-serif';

		var shader, uniforms, material;
		w = container.offsetWidth || window.innerWidth;
		h = container.offsetHeight || window.innerHeight;

		camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
		camera.position.z = distance;
		
		// make China faced to user
		target.x = 0.5;

		projector = new THREE.Projector();
		scene = new THREE.Scene();

		var geometry = new THREE.SphereGeometry(200, 40, 30);

		shader = Shaders['earth'];
		uniforms = THREE.UniformsUtils.clone(shader.uniforms);

		uniforms['texture'].value = THREE.ImageUtils.loadTexture(imgDir+'world.jpg');

		material = new THREE.ShaderMaterial({

			uniforms: uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader

		});

		sphereGeo = new THREE.Mesh(geometry, material);
		sphereGeo.rotation.y = Math.PI;
		scene.add(sphereGeo);

		shader = Shaders['atmosphere'];
		uniforms = THREE.UniformsUtils.clone(shader.uniforms);

		material = new THREE.ShaderMaterial({

			uniforms: uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader,
			side: THREE.BackSide,
			blending: THREE.AdditiveBlending,
			transparent: true

		});

		mesh = new THREE.Mesh(geometry, material);
		mesh.scale.set(1.1, 1.1, 1.1);
		scene.add(mesh);

		geometry = new THREE.CubeGeometry(0.75, 0.75, 1);
		geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -0.5));

		point = new THREE.Mesh(geometry);

		renderer = new THREE.WebGLRenderer({antialias: true});
		renderer.setSize(w, h);

		renderer.domElement.style.position = 'absolute';

		container.appendChild(renderer.domElement);

		container.addEventListener('mousedown', onMouseDown, false);

		container.addEventListener('mousemove', onMouseMove, false);

		container.addEventListener('mousewheel', onMouseWheel, false);

		document.addEventListener('keydown', onDocumentKeyDown, false);

		window.addEventListener('resize', onWindowResize, false);

		container.addEventListener('mouseover', function() {
			overRenderer = true;
		}, false);

		container.addEventListener('mouseout', function() {
			overRenderer = false;
		}, false);
	}

	addData = function(data, opts) {
		var lat, lng, color, i, step, colorFnWrapper;

		opts.animated = opts.animated || false;
		this.is_animated = opts.animated;

		step = 4;
		colorFnWrapper = function(data, i) { return colorFn(data[i + 3]); }

		if (opts.animated) {
			if (this._baseGeometry === undefined) {
				this._baseGeometry = new THREE.Geometry();
				for (i = 0; i < data.length; i += step) {
					city = data[i];
					lat = data[i + 1];
					lng = data[i + 2];
					color = colorFnWrapper(data,i);
					addPoint(lat, lng, city, color, this._baseGeometry, false);
				}
			}
			if(this._morphTargetId === undefined) {
				this._morphTargetId = 0;
			} else {
				this._morphTargetId += 1;
			}
			opts.name = opts.name || 'morphTarget'+this._morphTargetId;
		}
		var subgeo = new THREE.Geometry();

		for (i = 0; i < data.length; i += step) {
			city = data[i];
			lat = data[i + 1];
			lng = data[i + 2];
			color = colorFnWrapper(data,i);
			addPoint(lat, lng, city, color, subgeo, true);
		}
		if (opts.animated) {
			this._baseGeometry.morphTargets.push({'name': opts.name, vertices: subgeo.vertices});
		} else {
			this._baseGeometry = subgeo;
		}

	};

	function createPoints() {
		if (this._baseGeometry !== undefined) {
			if (this.is_animated === false) {
				this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
					color: 0xffffff,
					vertexColors: THREE.FaceColors,
					morphTargets: false
				}));
			} else {
				if (this._baseGeometry.morphTargets.length < 8) {
					console.log('t l',this._baseGeometry.morphTargets.length);
					var padding = 8-this._baseGeometry.morphTargets.length;
					console.log('padding', padding);
					for(var i=0; i<=padding; i++) {
						console.log('padding',i);
						this._baseGeometry.morphTargets.push({'name': 'morphPadding'+i, vertices: this._baseGeometry.vertices});
					}
				}
				this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
					color: 0xffffff,
					vertexColors: THREE.FaceColors,
					morphTargets: true
				}));
			}
			scene.add(this.points);
		}
	}

	function drawText(textString, color, phi, theta) {

		var text3d = new THREE.TextGeometry(textString, {
			size: 3,
			height: 0.1, // thickness of the text
			curveSegments: 2,
			font: 'helvetiker'
		});

		var textMaterial = new THREE.MeshBasicMaterial({ 
			color: color,
			overdraw: true 
		});

		textGeo = new THREE.Mesh(text3d, textMaterial);

		theta -= Math.PI / 360;
		textGeo.position.x = 200 * Math.sin(phi) * Math.cos(theta);
		textGeo.position.y = 200 * Math.cos(phi);
		textGeo.position.z = 200 * Math.sin(phi) * Math.sin(theta);

		textGeo.position.multiplyScalar(1.001);

		var lookat = textGeo.position.clone();
		lookat = lookat.multiplyScalar(2);
		textGeo.lookAt(lookat);

		scene.add(textGeo);
	}

	function addPoint(lat, lng, city, color, subgeo, record) {

		var phi = (90 - lat) * Math.PI / 180;
		var theta = (180 - lng) * Math.PI / 180;

		point.position.x = 200 * Math.sin(phi) * Math.cos(theta);
		point.position.y = 200 * Math.cos(phi);
		point.position.z = 200 * Math.sin(phi) * Math.sin(theta);

		point.lookAt(mesh.position);

		point.scale.x = 2;
		point.scale.y = 2;
		point.scale.z = 0.1;
		point.updateMatrix();

		// drawText(city, color, phi, theta);

		if (record) {
			cities.push({'position': point.position.clone(), 'name': city, 'phi': phi, 'theta': theta, 'color': color});
		}

		for (var i = 0; i < point.geometry.faces.length; i++) {
			point.geometry.faces[i].color = color;
		}

		THREE.GeometryUtils.merge(subgeo, point);
	}

	function objectPick(event) {
		var vector = new THREE.Vector3((event.clientX / w) * 2 - 1, - (event.clientY / h) * 2 + 1, 0.5);

		projector.unprojectVector(vector, camera);

		var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

		var intersects = raycaster.intersectObject(sphereGeo);

		if (intersects.length > 0) {
			return intersects[0].point;
		}

		return null;
	}

	function findClosestCity(point) {
		point.sub(mesh.position).normalize();

		var city;
		var i, index = -1, best, dist;

		for (i = 0; i < cities.length; i += 1) {
			city = cities[i].position.clone();
			city.sub(mesh.position).normalize();
			dist = city.dot(point);
			if (index === -1 || dist > best) {
				index = i;
				best = dist;
			} 
		}

		if (index === -1 || best < 0.9999) {
			return -1;
		}
		return index;
	}

	function onMouseDown(event) {
		event.preventDefault();

		// container.addEventListener('mousemove', onMouseMove, false);
		container.addEventListener('mouseup', onMouseUp, false);
		container.addEventListener('mouseout', onMouseOut, false);

		mouseOnDown.x = - event.clientX;
		mouseOnDown.y = event.clientY;

		targetOnDown.x = target.x;
		targetOnDown.y = target.y;

		container.style.cursor = 'move';

		mouseDownOn = true;
	}

	function onMouseMove(event) {
		if (mouseDownOn === true) {
			mouse.x = - event.clientX;
			mouse.y = event.clientY;

			var zoomDamp = distance / 1000;

			target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
			target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

			target.y = target.y > PI_HALF ? PI_HALF : target.y;
			target.y = target.y < - PI_HALF ? - PI_HALF : target.y;

			if (textGeo !== null) {
				scene.remove(textGeo);
				textGeo = null;
			}
			activeCity = -1;
		} else {
			clearTimeout(timer);
			timer = setTimeout(function() {
				var intersectPoint = objectPick(event);
				if (intersectPoint !== null) {
					var city = findClosestCity(intersectPoint);
					if (city !== activeCity) {
						if (textGeo !== null) {
							scene.remove(textGeo);
							textGeo = null;	
						}
						activeCity = city;
						if (city !== -1) {
							drawText(cities[city].name, cities[city].color, cities[city].phi, cities[city].theta);
						}
					}
				}
			}, 200);

		}	
	}

	function onMouseUp(event) {
		// container.removeEventListener('mousemove', onMouseMove, false);
		container.removeEventListener('mouseup', onMouseUp, false);
		container.removeEventListener('mouseout', onMouseOut, false);
		container.style.cursor = 'auto';

		if (activeCity != -1) {
			var dir = imgDir + 'journey/' + cities[activeCity].name + '.html';
			window.open(dir, '_blank');
		}
		mouseDownOn = false;
	}

	function onMouseOut(event) {
		//  container.removeEventListener('mousemove', onMouseMove, false);
		container.removeEventListener('mouseup', onMouseUp, false);
		container.removeEventListener('mouseout', onMouseOut, false);

		mouseDownOn = false;
	}

	function onMouseWheel(event) {
		event.preventDefault();
		if (overRenderer) {
			zoom(event.wheelDeltaY * 0.3);
		}
		return false;
	}

	function onDocumentKeyDown(event) {
		switch (event.keyCode) {
			case 38:
				zoom(100);
				event.preventDefault();
				break;
			case 40:
				zoom(-100);
				event.preventDefault();
				break;
		}
	}

	function onWindowResize( event ) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );
	}

	function zoom(delta) {
		distanceTarget -= delta;
		distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
		distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
	}

	function animate() {
		requestAnimationFrame(animate);
		render();
	}

	function render() {
		zoom(curZoomSpeed);

		rotation.x += (target.x - rotation.x) * 0.1;
		rotation.y += (target.y - rotation.y) * 0.1;
		distance += (distanceTarget - distance) * 0.3;

		camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
		camera.position.y = distance * Math.sin(rotation.y);
		camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

		camera.lookAt(mesh.position);

		renderer.render(scene, camera);
	}

	init();
	this.animate = animate;


	this.__defineGetter__('time', function() {
		return this._time || 0;
	});

	this.__defineSetter__('time', function(t) {
		var validMorphs = [];
		var morphDict = this.points.morphTargetDictionary;
		for(var k in morphDict) {
			if(k.indexOf('morphPadding') < 0) {
				validMorphs.push(morphDict[k]);
			}
		}
		validMorphs.sort();
		var l = validMorphs.length-1;
		var scaledt = t*l+1;
		var index = Math.floor(scaledt);
		for (i=0;i<validMorphs.length;i++) {
			this.points.morphTargetInfluences[validMorphs[i]] = 0;
		}
		var lastIndex = index - 1;
		var leftover = scaledt - index;
		if (lastIndex >= 0) {
			this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
		}
		this.points.morphTargetInfluences[index] = leftover;
		this._time = t;
	});

	this.addData = addData;
	this.createPoints = createPoints;
	this.renderer = renderer;
	this.scene = scene;

	return this;

};

