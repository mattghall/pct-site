let loadedImages = 0;
const imagesPerLoad = 5; // Number of images to load per click
let allImages = [];
let markers = {};
let scrollIntervalId = null;
var previousSelectedMarker = null;
const markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    removeOutsideVisibleBounds: true,
    animate: true,
    maxClusterRadius: 50, // pixels
    chunkedLoading: true
});

const BLOG_POST_FILE = 'resources/blog_posts.json';
const IMAGES_FILE = 'resources/images.json';
const GPX_FILE1 = "resources/pct_tiny.gpx";
const GPX_FILE2 = "resources/pct_small.gpx";
const GPX_FILE3 = "resources/pct_cleaned.gpx";

var map;
let currentGPXLayer = null;

$(function () {
    feather.replace();
    initMap();
    setIntroImageHeight();
    initImages();
    initBlog();
    initAutoScroll();
});

const defaultIcon = L.icon({
    iconUrl: 'resources/camera-gray.svg',
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
    popupAnchor: [0, -12.5]
});

const selectedIcon = L.icon({
    iconUrl: 'resources/camera-blue.svg', // Path to your selected icon
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
    popupAnchor: [0, -12.5]
})

let selectedMarker = null;

function selectMarker(marker) {
    if (selectedMarker) {
        // If there is already a selected marker, re-cluster it
        markerClusterGroup.addLayer(selectedMarker);
    }

    // Remove the marker from the cluster and add it to the map
    markerClusterGroup.removeLayer(marker);
    marker.addTo(map);
    selectedMarker = marker;
}

function unselectMarker() {
    if (selectedMarker) {
        // Remove the marker from the map and add it back to the cluster
        map.removeLayer(selectedMarker);
        markerClusterGroup.addLayer(selectedMarker);
        selectedMarker = null;
    }
}


function initMapWithImages() {
    for (var image of allImages) {
        addPhotoToMap(image);
    }
    // map.on('zoomend', updateMarkerVisibility);
    // updateMarkerVisibility()
}

function initImages() {
    fetch(IMAGES_FILE)
        .then(response => response.json())
        .then(images => {
            allImages = images;
            initMapWithImages();
            loadMoreImages(); // Load the first set of images
            setTimeout(document.getElementById('loadMore').style.display = 'flex', 3000);
        })
        .catch(error => console.error('Error loading images:', error));
}

function setIntroImageHeight() {
    var textHeight = $('#introSection').outerHeight();
    $('.introImg').css('height', textHeight + 15 + 'px');
}

function loadRoute(routeFile, color = '#FF5733') {
    // Create the new route layer but don't add it to the map yet
    let newGPXLayer = new L.GPX(routeFile, {
        async: true, polyline_options: {
            color: color, opacity: 0.75, weight: 2
        }, marker_options: {
            startIconUrl: 'resources/start.png', endIconUrl: 'resources/end.png', shadowUrl: 'resources/shadow.png'
        }
    }).on('loaded', function (e) {
        // Once the new route is loaded, remove the old route
        if (currentGPXLayer) {
            map.removeLayer(currentGPXLayer);
        }
        currentGPXLayer = newGPXLayer;

        newGPXLayer.addTo(map);

        if (routeFile === GPX_FILE1) {
            map.fitBounds(e.target.getBounds());
        }
    });

}

function initMap() {
    map = L.map('map').setView([47.6062, -122.3321], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12, attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load and display the GPX track
    loadRoute(GPX_FILE1);
    setTimeout(() => {
        loadRoute(GPX_FILE2);
        setTimeout(() => {
            loadRoute(GPX_FILE3);
        }, 100);
    }, 100);

    map.addLayer(markerClusterGroup);

    L.Control.ZoomLevel = L.Control.extend({
        onAdd: function (map) {
            var zoomLevelDiv = L.DomUtil.create('div', 'zoom-level-control');
            zoomLevelDiv.innerHTML = 'Zoom: ' + map.getZoom();
            map.on('zoomend', function () {
                zoomLevelDiv.innerHTML = 'Zoom: ' + map.getZoom();
            });
            return zoomLevelDiv;
        }
    });

    L.control.zoomlevel = function (opts) {
        return new L.Control.ZoomLevel(opts);
    }

    L.control.zoomlevel({position: 'topright'}).addTo(map);
}

function addPhotoToMap(image) {
    if (image.latitude && image.longitude) {
        const latLng = L.latLng(image.latitude, image.longitude);
        const marker = L.marker(latLng, {icon: defaultIcon});

        // Bind a popup to the marker
        marker.bindPopup(`<img src="${image.src}" alt="${image.alt}" style="max-width: 100px;"><p>${image.title}</p>`);

        // Add the marker to the cluster group instead of directly to the map
        markerClusterGroup.addLayer(marker);

        // Store the marker for later reference
        markers[`image-${image['#']}`] = marker;
    } else {
        console.log('Invalid coordinates for image:', image);
    }
}

function updateMarkerVisibility() {
    const zoomLevel = map.getZoom();
    const minZoomLevel = 10; // Set the minimum zoom level to show markers

    Object.values(markers).forEach(marker => {
        if (zoomLevel >= minZoomLevel) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}


function handleImageMouseEvents(imgContainer, image) {
    // Hover event listeners
    imgContainer.onmouseover = () => {
        imgContainer.style.borderColor = 'yellow';
        const marker = markers[`image-${image['#']}`];
        if (marker) {
            marker.setIcon(selectedIcon);
            selectMarker(marker);
        }
    };
    imgContainer.onmouseout = () => {
        imgContainer.style.borderColor = 'initial';
        const marker = markers[`image-${image['#']}`];
        if (marker) {
            marker.setIcon(defaultIcon);
            unselectMarker(marker)
        }
    };

    imgContainer.onclick = () => {
        const marker = markers[imgContainer.id];
        if (marker) {
            if (previousSelectedMarker) {
                previousSelectedMarker.setIcon(defaultIcon);
            }
            marker.setIcon(selectedIcon);
            selectMarker(marker)
            previousSelectedMarker = marker;

            map.flyTo(marker.getLatLng(), 12);
        }
    };
}

function addImageToGallery(image, gallery, loadMoreButton) {
    const imgContainer = document.createElement('div');
    imgContainer.classList.add('img-container');
    imgContainer.id = `image-${image['#']}`;
    imgContainer.style.opacity = 0;

    const img = document.createElement('img');
    img.src = image.src;
    img.alt = image.alt;
    img.onload = () => {
        imgContainer.style.opacity = 1;
    };

    const dateElement = document.createElement('div');
    dateElement.classList.add('img-date');
    dateElement.textContent = image.date;

    imgContainer.appendChild(img);
    imgContainer.appendChild(dateElement);
    gallery.insertBefore(imgContainer, loadMoreButton);
    // If the image is cached and already loaded
    if (img.complete) {
        imgContainer.style.opacity = 1;
    }
    return imgContainer;
}

function loadMoreImages() {
    const gallery = document.getElementById('photoGallery');
    const loadMoreButton = document.getElementById('loadMore');

    for (let i = loadedImages; i < loadedImages + imagesPerLoad && i < allImages.length; i++) {
        const image = allImages[i];
        const imgContainer = addImageToGallery(image, gallery, loadMoreButton);
        handleImageMouseEvents(imgContainer, image);
    }

    loadedImages += imagesPerLoad;

    if (loadedImages >= allImages.length) {
        loadMoreButton.style.display = 'none';
    }

}

function startAutoScroll() {
    const gallery = document.getElementById('photoGallery');
    const scrollAmount = 1;
    const scrollInterval = 100;

    scrollIntervalId = setInterval(() => {
        if (gallery.scrollWidth !== gallery.clientWidth + gallery.scrollLeft) {
            gallery.scrollLeft += scrollAmount;
        } else {
            // setTimeout(() => {gallery.scrollLeft = 0}, 1000);
            loadMoreImages();
        }
    }, scrollInterval);
}

function stopAutoScroll() {
    clearInterval(scrollIntervalId);
}

function initAutoScroll() {
    const gallery = document.getElementById('photoGallery');
    startAutoScroll();
    gallery.addEventListener('mouseover', stopAutoScroll);
    gallery.addEventListener('mouseout', startAutoScroll);
}

function buildBlogPostDiv(postElement, post, i) {
    postElement.innerHTML = `
                <div class="post-outer">
                    <div class="post">
                        <h3 class="post-title entry-title">
                            <a href="#">${post.title}</a>
                        </h3>
                        <div class="post-header">
                            <div class="post-header-line-1">
                                  <span class="byline post-timestamp">
                                  <time class="published" datetime="${post.datetime}"
                                        title="${post.datetime}">
                                  ${new Date(post.datetime).toLocaleDateString()}
                                  </time>
                                  </span>
                            </div>
                        </div>
                        <div class="post-body" id="post-snippet-${i}">
                            <div class="post-snippet snippet-container r-snippet-container">
                                <div class="snippet-item r-snippetized">
                                    ${post.body.replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
}

function initBlog() {
    const container = document.getElementById('blog-posts');
    let currentPostIndex = 0;
    const postsPerPage = 5;

    function loadBlogPosts() {
        // Assuming the JSON file is served from your server
        fetch(BLOG_POST_FILE)
            .then(response => response.json())
            .then(posts => {
                appendPosts(posts);
            });
    }

    function appendPosts(posts) {
        for (let i = currentPostIndex; i < currentPostIndex + postsPerPage && i < posts.length; i++) {
            const post = posts[i];
            const postElement = document.createElement('article');
            postElement.className = 'post-outer-container';
            buildBlogPostDiv(postElement, post, i);
            container.appendChild(postElement);
        }
        currentPostIndex += postsPerPage;
    }

    function isNearBottom() {
        return window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
    }

    window.addEventListener('scroll', function () {
        if (isNearBottom()) {
            loadBlogPosts();
        }
    });
    // Initial load
    loadBlogPosts();
}