// CameraSystem.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraSystem {
    constructor(renderer, targetObject) {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.defaultFov = 75;

        // 0: orbit, 1: selfie stick, 2+: first-person cameras
        this.cameraMode = 0;

        this.targetObject = targetObject;
        this.firstPersonCameras = [];

        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 1.0;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 100;

        this.controls.target.set(-2.5, 0, 4.5);
        this.camera.position.set(-2.5, 0.5, 7.5);
        this.controls.update();

        this.cameraOffset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        this.previousTarget = this.controls.target.clone();

        this.isDragging = false;
        this.mouseDownX = 0;
        this.mouseDownY = 0;

        // Overlay state
        this.overlayContainer = null;
        this.overlayImage = null;
        this.activeOverlaySrc = null;
        this.createOverlayElement();

        this.setupEventListeners(renderer);
        window.addEventListener('resize', this.handleResize.bind(this));

        this.initializeCameras();
    }

    async initializeCameras() {
        if (window.uploadedFiles && window.uploadedFiles.config && window.uploadedFiles.config.cameras) {
            console.log('Using uploaded camera configuration');
            this.loadCamerasWithConfig(window.uploadedFiles.config.cameras);
        } else {
            console.log('Loading camera configuration from file');
            await this.loadCameraConfigurations();
        }
    }

    loadCameraConfigurations() {
        const filename = 'cameras.json';

        fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load camera configurations: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    this.processCameraConfig(data);
                } else if (data && data.cameras) {
                    this.processCameraConfig(data.cameras);
                } else {
                    console.warn('Invalid camera configuration format, using default');
                    this.processCameraConfig([{
                        name: "Default",
                        position: { x: 0, y: 0, z: 0 },
                        rotation: { x: 0, y: Math.PI, z: 0 },
                        fov: 75
                    }]);
                }
                console.log(`Loaded ${this.firstPersonCameras.length} camera configurations`);
            })
            .catch(error => {
                console.error('Error loading camera configurations:', error);
                this.processCameraConfig([{
                    name: "Default",
                    position: { x: 0, y: 0, z: 0 },
                    rotation: { x: 0, y: Math.PI, z: 0 },
                    fov: 75
                }]);
            });
    }

    loadCamerasWithConfig(cameraConfig) {
        if (Array.isArray(cameraConfig)) {
            this.processCameraConfig(cameraConfig);
        } else if (cameraConfig && cameraConfig.cameras) {
            this.processCameraConfig(cameraConfig.cameras);
        } else {
            console.warn('Invalid camera configuration format, using default');
            this.processCameraConfig([{
                name: "Default",
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: Math.PI, z: 0 },
                fov: 75
            }]);
        }
        console.log(`Loaded ${this.firstPersonCameras.length} camera configurations from config`);
    }

    processCameraConfig(data) {
        if (Array.isArray(data)) {
            this.firstPersonCameras = data;
        } else {
            console.warn('Camera configuration data is not an array');
            this.firstPersonCameras = [];
        }

        // Refresh overlay in case cameras were reloaded while a mode is active
        this.updateOverlayForCurrentMode();
    }

    setupEventListeners(renderer) {
        renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
        renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
        renderer.domElement.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    createOverlayElement() {
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.id = 'camera-overlay-container';
        this.overlayContainer.style.position = 'fixed';
        this.overlayContainer.style.top = '0';
        this.overlayContainer.style.left = '0';
        this.overlayContainer.style.width = '100vw';
        this.overlayContainer.style.height = '100vh';
        this.overlayContainer.style.pointerEvents = 'none';
        this.overlayContainer.style.zIndex = '999';
        this.overlayContainer.style.display = 'none';
        this.overlayContainer.style.overflow = 'hidden';

        this.overlayImage = document.createElement('img');
        this.overlayImage.id = 'camera-overlay-image';
        this.overlayImage.alt = 'Camera overlay';
        this.overlayImage.style.position = 'absolute';
        this.overlayImage.style.top = '0';
        this.overlayImage.style.left = '0';
        this.overlayImage.style.width = '100%';
        this.overlayImage.style.height = '100%';
        this.overlayImage.style.objectFit = 'cover';
        this.overlayImage.style.pointerEvents = 'none';
        this.overlayImage.style.userSelect = 'none';

        this.overlayContainer.appendChild(this.overlayImage);
        document.body.appendChild(this.overlayContainer);
    }

    showOverlay(imageSrc) {
        if (!imageSrc) {
            this.hideOverlay();
            return;
        }

        if (this.activeOverlaySrc !== imageSrc) {
            this.overlayImage.src = imageSrc;
            this.activeOverlaySrc = imageSrc;
        }

        this.overlayContainer.style.display = 'block';
    }

    hideOverlay() {
        this.overlayContainer.style.display = 'none';
        this.activeOverlaySrc = null;
        this.overlayImage.removeAttribute('src');
    }

    updateOverlayForCurrentMode() {
        if (this.cameraMode > 1) {
            const cameraIndex = this.cameraMode - 2;
            const currentCamera = this.firstPersonCameras[cameraIndex];

            if (currentCamera && currentCamera.overlayImage) {
                this.showOverlay(currentCamera.overlayImage);
                return;
            }

            // Optional alternate property names
            if (currentCamera && currentCamera.overlay) {
                this.showOverlay(currentCamera.overlay);
                return;
            }

            if (currentCamera && currentCamera.overlaySrc) {
                this.showOverlay(currentCamera.overlaySrc);
                return;
            }
        }

        this.hideOverlay();
    }

    onMouseDown(e) {
        if (this.cameraMode !== 1) return;
        this.isDragging = true;
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
    }

    onMouseUp(e) {
        if (this.cameraMode !== 1) return;
        this.isDragging = false;
    }

    onMouseMove(e) {
        if (this.cameraMode !== 1 || !this.isDragging) return;
        const deltaX = e.clientX - this.mouseDownX;
        const deltaY = e.clientY - this.mouseDownY;
        const spherical = this.controls._spherical;
        spherical.theta -= (2 * Math.PI * deltaX / window.innerWidth) * this.controls.rotateSpeed;
        spherical.phi += (2 * Math.PI * deltaY / window.innerHeight) * this.controls.rotateSpeed;
        spherical.phi = Math.max(0.0001, Math.min(Math.PI - 0.0001, spherical.phi));
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
    }

    onWheel(e) {
        if (this.cameraMode !== 1) return;
        e.preventDefault();
        const scale = e.deltaY / 100.0 * this.controls.zoomSpeed;
        this.controls._spherical.radius *= (1 + scale);
        this.controls._spherical.radius = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.controls._spherical.radius));
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    setSphericalFromVector(vec) {
        const radius = vec.length();
        if (radius === 0) return;
        const v = vec.clone().normalize();
        const phi = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
        const theta = Math.atan2(v.z, v.x);
        this.controls._spherical.radius = radius;
        this.controls._spherical.phi = phi;
        this.controls._spherical.theta = theta;
    }

    switchCameraMode() {
        const oldMode = this.cameraMode;
        const totalModes = 2 + this.firstPersonCameras.length;

        this.cameraMode = (this.cameraMode + 1) % totalModes;

        if (oldMode === totalModes - 1 && this.cameraMode === 0) {
            this.camera.fov = this.defaultFov;
            this.camera.updateProjectionMatrix();
        }

        this.controls.enabled = (this.cameraMode === 0);

        if (this.cameraMode === 0) {
            this.controls.target.copy(this.targetObject.position);
            this.previousTarget.copy(this.targetObject.position);
            let initOffset;
            if (oldMode > 1) {
                initOffset = this.cameraOffset.clone();
            } else {
                initOffset = this.camera.position.clone().sub(this.targetObject.position);
            }
            this.camera.position.copy(this.targetObject.position).add(initOffset);
            this.controls.update();
        } else if (this.cameraMode === 1) {
            this.controls.enabled = false;
            this.controls.target.copy(this.targetObject.position);
            this.previousTarget.copy(this.targetObject.position);
            let initOffset;
            if (oldMode > 1) {
                initOffset = this.cameraOffset.clone();
            } else {
                initOffset = this.camera.position.clone().sub(this.targetObject.position);
            }
            const invQuat = this.targetObject.quaternion.clone().invert();
            const localInit = initOffset.clone().applyQuaternion(invQuat);
            this.setSphericalFromVector(localInit);

            const spherical = this.controls._spherical;
            const radius = spherical.radius;
            const phi = spherical.phi;
            const theta = spherical.theta;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const localOffset = new THREE.Vector3(
                radius * sinPhi * cosTheta,
                radius * cosPhi,
                radius * sinPhi * sinTheta
            );
            const worldOffset = localOffset.clone().applyQuaternion(this.targetObject.quaternion);
            const idealPos = this.targetObject.position.clone().add(worldOffset);
            const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.targetObject.quaternion).normalize();
            const idealMat = new THREE.Matrix4().lookAt(idealPos, this.targetObject.position, worldUp);
            const idealQuat = new THREE.Quaternion().setFromRotationMatrix(idealMat);
            this.camera.position.copy(idealPos);
            this.camera.quaternion.copy(idealQuat);
        } else if (this.cameraMode > 1) {
            const cameraIndex = this.cameraMode - 2;
            if (cameraIndex < this.firstPersonCameras.length) {
                console.log(`Switched to camera: ${this.firstPersonCameras[cameraIndex].name}`);
            }
        }

        // Update overlay whenever mode changes
        this.updateOverlayForCurrentMode();
    }

    update() {
        if (this.cameraMode === 0) {
            const delta = new THREE.Vector3().subVectors(this.targetObject.position, this.previousTarget);
            this.camera.position.add(delta);
            this.controls.target.copy(this.targetObject.position);
            this.previousTarget.copy(this.targetObject.position);
            this.controls.update();
        } else if (this.cameraMode === 1) {
            const spherical = this.controls._spherical;
            const radius = spherical.radius;
            const phi = spherical.phi;
            const theta = spherical.theta;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const localOffset = new THREE.Vector3(
                radius * sinPhi * cosTheta,
                radius * cosPhi,
                radius * sinPhi * sinTheta
            );
            const worldOffset = localOffset.clone().applyQuaternion(this.targetObject.quaternion);
            const idealPos = this.targetObject.position.clone().add(worldOffset);
            const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.targetObject.quaternion).normalize();
            const idealMat = new THREE.Matrix4().lookAt(idealPos, this.targetObject.position, worldUp);
            const idealQuat = new THREE.Quaternion().setFromRotationMatrix(idealMat);

            if (this.controls.enableDamping) {
                this.camera.position.lerp(idealPos, this.controls.dampingFactor);
                this.camera.quaternion.slerp(idealQuat, this.controls.dampingFactor);
            } else {
                this.camera.position.copy(idealPos);
                this.camera.quaternion.copy(idealQuat);
            }
        } else if (this.cameraMode > 1) {
            const cameraIndex = this.cameraMode - 2;
            if (cameraIndex < this.firstPersonCameras.length) {
                const currentCamera = this.firstPersonCameras[cameraIndex];

                const centerOfMassOffset = this.targetObject.userData?.centerOfMassOffset || { x: 0, y: 0, z: 0 };

                const localPosition = new THREE.Vector3(
                    parseFloat(currentCamera.position.x) - (centerOfMassOffset.x || 0),
                    parseFloat(currentCamera.position.y) - (centerOfMassOffset.y || 0),
                    parseFloat(currentCamera.position.z) - (centerOfMassOffset.z || 0)
                );

                const worldPosition = localPosition.applyQuaternion(this.targetObject.quaternion);
                this.camera.position.copy(this.targetObject.position).add(worldPosition);

                const localRotation = new THREE.Euler(
                    parseFloat(currentCamera.rotation.x),
                    parseFloat(currentCamera.rotation.y),
                    parseFloat(currentCamera.rotation.z)
                );

                const localQuaternion = new THREE.Quaternion().setFromEuler(localRotation);
                const worldQuaternion = this.targetObject.quaternion.clone().multiply(localQuaternion);
                this.camera.quaternion.copy(worldQuaternion);

                if (currentCamera.fov !== undefined) {
                    this.camera.fov = parseFloat(currentCamera.fov);
                    this.camera.updateProjectionMatrix();
                }

                // Keep overlay synced in case config changes live
                if (currentCamera.overlayImage) {
                    this.showOverlay(currentCamera.overlayImage);
                } else if (currentCamera.overlay) {
                    this.showOverlay(currentCamera.overlay);
                } else if (currentCamera.overlaySrc) {
                    this.showOverlay(currentCamera.overlaySrc);
                } else {
                    this.hideOverlay();
                }
            }
        }
    }

    reset() {
        this.cameraMode = 0;
        this.controls.target.set(-2.5, 0, 4.5);
        this.camera.position.copy(this.controls.target.clone().add(this.cameraOffset));
        this.previousTarget.copy(this.controls.target);
        this.controls.update();
        this.hideOverlay();
    }

    getCamera() {
        return this.camera;
    }

    getCameraMode() {
        if (this.cameraMode === 0) {
            return "Orbit";
        } else if (this.cameraMode === 1) {
            return "Selfie Stick";
        } else if (this.cameraMode > 1) {
            const cameraIndex = this.cameraMode - 2;
            if (cameraIndex < this.firstPersonCameras.length) {
                return this.firstPersonCameras[cameraIndex].name;
            }
        }
        return "Unknown";
    }

    destroy() {
        if (this.overlayContainer && this.overlayContainer.parentNode) {
            this.overlayContainer.parentNode.removeChild(this.overlayContainer);
        }
    }
}
        return "Unknown";
    }

}
