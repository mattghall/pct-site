let loadedImages = 0;
const imagesPerLoad = 5; // Number of images to load per click
let allImages = [];
let markers = [];
// let markers = {};
let scrollIntervalId = null;

const BLOG_POST_FILE = 'resources/blog_posts.json';
const IMAGES_FILE = 'resources/images.json';
const GPX_FILE1 = "resources/pct_tiny.gpx";
const GPX_FILE2 = "resources/pct_small.gpx";
const GPX_FILE3 = "resources/pct_cleaned.gpx";

var map;
let currentGPXLayer = null;

$(function () {
    map = L.map('map').setView([47.6062, -122.3321], 6);
    feather.replace();
    setIntroImageHeight();
    initImages();
    initMap();
    initBlog();
    initAutoScroll();
});

function initMapWithImages() {
    for (var image of allImages) {
        addPhotoToMap(image);
    }
    map.on('zoomend', updateMarkerVisibility);
    updateMarkerVisibility()
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 25, attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load and display the GPX track
    loadRoute(GPX_FILE1);
    setTimeout(() => {
        loadRoute(GPX_FILE2);
    }, 1000);
    setTimeout(() => {
        loadRoute(GPX_FILE3);
    }, 2000);
}

function addPhotoToMap(image) {
    if (image.latitude && image.longitude) {
        const latLng = L.latLng(image.latitude, image.longitude);

        // Define a custom icon
        const customIcon = L.icon({
            iconUrl: 'resources/camera.svg',   // Path to your SVG icon
            iconSize: [20, 20],              // Size of the icon (width, height)
            iconAnchor: [10, 10],        // Anchor point of the icon
            popupAnchor: [10, 10]          // Point where the popup should open relative to the iconAnchor
        });

        // Create a marker with the custom icon
        const marker = L.marker(latLng, {icon: customIcon}).addTo(map);

        // Bind a popup to the marker
        marker.bindPopup(`<img src="${image.src}" alt="${image.alt}" style="max-width: 100px;"><p>${image.title}</p>`);
        markers.push(marker);

    } else {
        console.log('Invalid coordinates for image:', image);
    }
}

function updateMarkerVisibility() {
    const zoomLevel = map.getZoom();
    const minZoomLevel = 8; // Set the minimum zoom level to show markers

    markers.forEach(marker => {
        if (zoomLevel >= minZoomLevel) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}


function loadMoreImages() {
    const gallery = document.getElementById('photoGallery');
    const loadMoreButton = document.getElementById('loadMore');

    for (let i = loadedImages; i < loadedImages + imagesPerLoad && i < allImages.length; i++) {
        const image = allImages[i];

        const imgContainer = document.createElement('div');
        imgContainer.classList.add('img-container');
        imgContainer.id = `image-${image['#']}`;
        imgContainer.style.opacity = 0; // Start with the container hidden

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
        // addPhotoToMap(image);
        // If the image is cached and already loaded
        if (img.complete) {
            imgContainer.style.opacity = 1;
        }
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