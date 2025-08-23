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

const markerOptions = {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null,
        wptIconUrls: {},
        marker: function() { return null; },
        startMarker: function() { return null; },
        endMarker: function() { return null; },
        wptMarker: function() { return null; }
};

const BLOG_POST_FILE = 'resources/blog_posts.json';
const BLOG_POST_OLD_FILE = 'resources/blog_posts_old.json';
const IMAGES_FILE = 'resources/images.json';

const GPX_COMBINED_ZIP = 'tracks/combined/combined-small.zip';

var map;
let currentGPXLayer = null;
let mainBounds = null;

// Track GPX loading progress
let totalLegsToLoad = 0;
let legsLoaded = 0;
let allLegsLoadedCallback = null;

$(function () {
    feather.replace();
    initMap();
    setIntroImageHeight();
    initBlog();
    initAutoScroll();
    document.addEventListener('click', function (event) {
        // Check if the clicked element is not an image and not part of the map
        if (!event.target.matches('img') && !event.target.closest('#map') && selectedMarker) {
            unselectMarker(selectedMarker);
        }
    });
});

const defaultIcon = L.icon({
    iconUrl: 'resources/img/camera-gray.svg',
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
    popupAnchor: [0, -12.5]
});

const selectedIcon = L.icon({
    iconUrl: 'resources/img/camera-blue.svg', 
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
    popupAnchor: [0, -12.5]
})

const hoverIcon = L.icon({
    iconUrl: 'resources/img/camera-orange.svg', 
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
    popupAnchor: [0, -12.5]
})

let selectedMarker = null;

function selectMarker(marker, image) {
    unselectMarker();
    $(".featured-photo").attr("src", image.src);

    // Remove the marker from the cluster and add it to the map
    marker.setIcon(selectedIcon);
    markerClusterGroup.removeLayer(marker);
    marker.addTo(map);
    selectedMarker = marker;
}

function unselectMarker() {
    if (selectedMarker) {
        // Remove the marker from the map and add it back to the cluster
        selectedMarker.setIcon(defaultIcon);
        map.removeLayer(selectedMarker);
        markerClusterGroup.addLayer(selectedMarker);
        selectedMarker = null;
    }
}

let hoveredMarker = null;

function hoverMarker(marker, image) {
    if (hoveredMarker) {
        // If there is already a selected marker, re-cluster it
        markerClusterGroup.addLayer(hoveredMarker);
    }
    $(".featured-photo").attr("src", image.src);

    // Remove the marker from the cluster and add it to the map
    marker.setIcon(hoverIcon);
    markerClusterGroup.removeLayer(marker);
    marker.addTo(map);
    hoveredMarker = marker;
}

function unhoverMarker(marker, image) {
    if (hoveredMarker) {
        if (marker === selectedMarker) {
            selectMarker(marker, image);
            return;
        }
        // Remove the marker from the map and add it back to the cluster
        marker.setIcon(defaultIcon);
        map.removeLayer(hoveredMarker);
        markerClusterGroup.addLayer(hoveredMarker);
        hoveredMarker = null;
    }
}

function initMapWithImages() {
    for (var image of allImages) {
        addPhotoToMap(image);
    }
}

function initImages() {
    fetch(IMAGES_FILE)
        .then(response => response.json())
        .then(images => {
            allImages = images;
            initMapWithImages();
            // loadMoreImages(); // Removed automatic loading - images now load only manually
            setTimeout(document.getElementById('loadMore').style.display = 'flex', 3000);
        })
        .catch(error => console.error('Error loading images:', error));
}

function setIntroImageHeight() {
    var textHeight = $('#introSection').outerHeight();
    $('.introImg').css('height', textHeight + 15 + 'px');
}

async function getLegs(size) {
    let fileName = '';
    switch (size) {
        case 'small':
            fileName = 'gpxSmall.zip';
            break;
        case 'medium':
            fileName = 'gpxMedium.zip';
            break;
        case 'full':
            fileName = 'gpxFull.zip';
            break;
        default:
            console.error('Invalid size parameter');
            return;
    }
    fileName = `tracks/zipped/${fileName}`;
    // 1. Download the ZIP file
    fetch(fileName)
    .then(response => response.arrayBuffer())
    .then(buffer => {
        // 2. Unzip using JSZip
        JSZip.loadAsync(buffer).then(zip => {
            // Count total GPX files to track loading progress
            const gpxFiles = Object.keys(zip.files).filter(filename => filename.toLowerCase().endsWith('.gpx'));
            totalLegsToLoad = gpxFiles.length;
            legsLoaded = 0;
            
            // Set callback to initialize images after all legs load
            allLegsLoadedCallback = initImages;
            
            console.log(`Loading ${totalLegsToLoad} GPX legs...`);
            
            // List files in the ZIP
            gpxFiles.forEach(filename => {
                zip.files[filename].async('string').then(content => {
                    loadLeg(content); // Pass GPX XML string
                });
            });
        });
    });
}


// Alternate between three dark shades of red and orange for better visibility
let colors = [
  '#8B0000', // Dark Red
  '#FF8C00', // Dark Orange
  '#BB2100'  // Deep Red-Orange
];

let legColorIndex = 0;

function loadLeg(gpxContent) {
  const color = colors[legColorIndex % colors.length];
  legColorIndex++;

  // Parse GPX XML string as a Blob and use as a file for L.GPX
  const gpxBlob = new Blob([gpxContent], { type: 'application/gpx+xml' });
  const gpxUrl = URL.createObjectURL(gpxBlob);

  let legLayer = new L.GPX(gpxUrl, {
    async: true,
    polyline_options: {
      color: color,
      opacity: 1,
      weight: 4, 
      pane: 'overlayPane' 
    },
    marker_options: markerOptions,
  }).on('loaded', function (e) {
    legLayer.addTo(map);
    legLayer.bringToFront();
    URL.revokeObjectURL(gpxUrl);
    
    legsLoaded++;
    console.log(`Loaded leg ${legsLoaded}/${totalLegsToLoad}`);
    
    // If all legs are loaded, call the callback (to init images)
    if (legsLoaded >= totalLegsToLoad && allLegsLoadedCallback) {
      console.log('All GPX legs loaded, initializing images...');
      allLegsLoadedCallback();
      allLegsLoadedCallback = null; // Prevent multiple calls
    }
  });
}

function loadCombinedRoute(zipFile, onLoadCallback, color = '#63dbff') {
    // Download and extract the combined route zip file
    fetch(zipFile)
    .then(response => response.arrayBuffer())
    .then(buffer => {
        // Unzip using JSZip
        JSZip.loadAsync(buffer).then(zip => {
            // Find the GPX file in the zip
            const gpxFileName = Object.keys(zip.files).find(filename => 
                filename.toLowerCase().endsWith('.gpx')
            );
            
            if (gpxFileName) {
                zip.files[gpxFileName].async('string').then(gpxContent => {
                    // Create a blob URL for the GPX content
                    const gpxBlob = new Blob([gpxContent], { type: 'application/gpx+xml' });
                    const gpxUrl = URL.createObjectURL(gpxBlob);
                    
                    // Load the GPX using Leaflet
                    let combinedGPXLayer = new L.GPX(gpxUrl, {
                        async: true,
                        polyline_options: {
                            color: color, opacity: 1, weight: 4
                        }, marker_options: markerOptions,
                    }).on('loaded', function (e) {
                        // Set as current GPX layer
                        if (currentGPXLayer) {
                            map.removeLayer(currentGPXLayer);
                        }
                        currentGPXLayer = combinedGPXLayer;
                        combinedGPXLayer.addTo(map);
                        combinedGPXLayer.bringToBack();
                        mainBounds = e.target.getBounds();
                        map.fitBounds(mainBounds);
                        
                        console.log('Combined route loaded from zip, now loading individual legs...');
                        
                        // Clean up the blob URL
                        URL.revokeObjectURL(gpxUrl);
                        
                        // Call the callback to load individual legs
                        if (onLoadCallback) {
                            onLoadCallback();
                        }
                    }).on('error', function(e) {
                        console.error('Error loading combined route from zip:', e);
                        // Clean up the blob URL
                        URL.revokeObjectURL(gpxUrl);
                        // Still try to load legs even if combined route fails
                        if (onLoadCallback) {
                            onLoadCallback();
                        }
                    });
                });
            } else {
                console.error('No GPX file found in zip');
                if (onLoadCallback) {
                    onLoadCallback();
                }
            }
        });
    })
    .catch(error => {
        console.error('Error downloading combined route zip:', error);
        if (onLoadCallback) {
            onLoadCallback();
        }
    });
}

function loadRoute(routeFile, color = '#BB2100') {
    // Create the new route layer but don't add it to the map yet
    let newGPXLayer = new L.GPX(routeFile, {
        async: true,
        polyline_options: {
            color: color, opacity: 1, weight: 4
        }, marker_options: markerOptions,
    }).on('loaded', function (e) {
        // Once the new route is loaded, remove the old route
        if (currentGPXLayer) {
            map.removeLayer(currentGPXLayer);
        }
        currentGPXLayer = newGPXLayer;
        newGPXLayer.addTo(map);
        mainBounds = e.target.getBounds();
        if (routeFile === GPX_FILE1) {       
            map.fitBounds(mainBounds);
        }
    });
}

function initMap() {
    map = L.map('map').setView([47.6062, -122.3321], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12, attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load combined track first, then individual legs after it loads
    loadCombinedRoute(GPX_COMBINED_ZIP, () => {
        // Only load individual legs after combined route is loaded
        getLegs('small');
    });

    map.addLayer(markerClusterGroup);

    // L.Control.ZoomLevel = L.Control.extend({
    //     onAdd: function (map) {
    //         var zoomLevelDiv = L.DomUtil.create('div', 'zoom-level-control');
    //         zoomLevelDiv.innerHTML = 'Zoom: ' + map.getZoom();
    //         map.on('zoomend', function () {
    //             zoomLevelDiv.innerHTML = 'Zoom: ' + map.getZoom();
    //         });
    //         return zoomLevelDiv;
    //     }
    // });
    //
    // L.control.zoomlevel = function (opts) {
    //     return new L.Control.ZoomLevel(opts);
    // }
    //
    // L.control.zoomlevel({position: 'topright'}).addTo(map);
}

function addPhotoToMap(image) {
    if (image.latitude && image.longitude) {
        const latLng = L.latLng(image.latitude, image.longitude);
        const marker = L.marker(latLng, {icon: defaultIcon});

        // Bind a popup to the marker
        marker.bindPopup(`<img src="${image.src}" alt="${image.alt}" style="max-width: 100px;"><p>${image.title}</p>`);
        marker.on('click', function () {
            selectMarker(marker, image);
        });
        // Add the marker to the cluster group instead of directly to the map
        markerClusterGroup.addLayer(marker);

        // Store the marker for later reference
        markers[`image-${image['#']}`] = marker;
    } else {
        console.log('Invalid coordinates for image:', image);
    }
}


var markerClicked = false;

function handleImageMouseEvents(imgContainer, image) {
    // Hover event listeners
    imgContainer.onmouseover = () => {
        imgContainer.style.borderColor = 'yellow';
        const marker = markers[`image-${image['#']}`];
        if (marker) {
            hoverMarker(marker, image);
        }
    };
    imgContainer.onmouseout = () => {
        imgContainer.style.borderColor = 'initial';
        const marker = markers[`image-${image['#']}`];
        if (marker) {
            unhoverMarker(marker, image);
        }
    };

    imgContainer.onclick = () => {
        markerClicked = true;
        const marker = markers[imgContainer.id];
        if (marker) {
            selectMarker(marker, image);
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
            // loadMoreImages(); // Removed automatic loading when scroll reaches end
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

function loadBlogPosts() {
    fetch(BLOG_POST_FILE)
        .then(response => response.json())
        .then(posts => {
            appendPosts(posts);
        });
}

function loadOldBlogPosts() {
    fetch(BLOG_POST_OLD_FILE)
        .then(response => response.json())
        .then(posts => {
            appendPosts(posts);
        });
}

function initBlog() {
    const container = document.getElementById('blog-posts');
    let currentPostIndex = 0;
    const postsPerPage = 5;
    let allPosts = [];
    let loadingOld = false;
    let oldPosts = [];

    // Create and append the Load More button
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.id = 'load-more-posts-btn';
    loadMoreBtn.style.display = 'block';
    loadMoreBtn.style.margin = '2em auto';
    loadMoreBtn.style.padding = '1em 2em';
    loadMoreBtn.style.fontSize = '1.2em';
    container.after(loadMoreBtn);

    function appendPosts(posts) {
        for (let i = currentPostIndex; i < currentPostIndex + postsPerPage && i < posts.length; i++) {
            const post = posts[i];
            const postElement = document.createElement('article');
            postElement.className = 'post-outer-container';
            buildBlogPostDiv(postElement, post, i);
            container.appendChild(postElement);
        }
        currentPostIndex += postsPerPage;

        // If we've loaded all posts from the current file, try to load old posts
        if (currentPostIndex >= posts.length && !loadingOld) {
            loadingOld = true;
            fetch(BLOG_POST_OLD_FILE)
                .then(response => response.json())
                .then(posts => {
                    oldPosts = posts;
                    currentPostIndex = 0;
                    allPosts = oldPosts;
                    // If there are old posts, show the button again
                    if (oldPosts.length > 0) {
                        loadMoreBtn.style.display = 'block';
                    } else {
                        loadMoreBtn.style.display = 'none';
                    }
                });
        } else if (currentPostIndex >= posts.length && loadingOld) {
            // No more posts to load
            loadMoreBtn.style.display = 'none';
        }
    }

    function loadMorePosts() {
        appendPosts(allPosts);
    }

    loadMoreBtn.addEventListener('click', loadMorePosts);

    // Initial load
    fetch(BLOG_POST_FILE)
        .then(response => response.json())
        .then(posts => {
            allPosts = posts;
            appendPosts(allPosts);
        });
}
