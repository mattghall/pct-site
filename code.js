let loadedImages = 0;
const imagesPerLoad = 10; // Number of images to load per click
let allImages = [];

$(function () {
    feather.replace();

    fetch('images.json') // Replace with the actual path to your JSON file
        .then(response => response.json())
        .then(images => {
            allImages = images;
            loadMoreImages(); // Load the first set of images
            setTimeout(document.getElementById('loadMore').style.display = 'flex', 3000);
        })
        .catch(error => console.error('Error loading images:', error));
});

document.addEventListener('DOMContentLoaded', function() {
    var map = L.map('map').setView([47.6062, -122.3321], 6); // Example coordinates

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load and display the GPX track
    new L.GPX("pct_cleaned.gpx", {
        async: true,
        marker_options: {
            startIconUrl: 'start.png',
            endIconUrl: 'end.png',
            shadowUrl: 'shadow.png'
        }
    }).on('loaded', function(e) {
        map.fitBounds(e.target.getBounds());
    }).addTo(map);
});

function loadMoreImages() {
    const gallery = document.getElementById('photoGallery');
    const loadMoreButton = document.getElementById('loadMore');

    for (let i = loadedImages; i < loadedImages + imagesPerLoad && i < allImages.length; i++) {
        const image = allImages[i];

        const imgContainer = document.createElement('div');
        imgContainer.classList.add('img-container');
        imgContainer.id = `image-${image['#']}`; // Assign an ID for scrolling reference

        const img = document.createElement('img');
        img.src = image.src;
        img.alt = image.alt;

        const dateElement = document.createElement('div');
        dateElement.classList.add('img-date');
        dateElement.textContent = image.date;

        imgContainer.appendChild(img);
        imgContainer.appendChild(dateElement);
        gallery.insertBefore(imgContainer, loadMoreButton);
    }

    loadedImages += imagesPerLoad;

    if (loadedImages >= allImages.length) {
        loadMoreButton.style.display = 'none';
    }
}

function scrollToImageByDate(targetDate) {
    const targetImage = allImages.find(image => new Date(image.date).toLocaleDateString() === targetDate);
    if (targetImage) {
        const element = document.getElementById(`image-${targetImage['#']}`);
        if (element) {
            element.scrollIntoView({behavior: 'smooth'});
        }
    }
}


let scrollIntervalId = null;

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

document.addEventListener('DOMContentLoaded', function () {
    const gallery = document.getElementById('photoGallery');

    startAutoScroll();

    gallery.addEventListener('mouseover', stopAutoScroll);
    gallery.addEventListener('mouseout', startAutoScroll);
});

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('blog-posts');
    let currentPostIndex = 0;
    const postsPerPage = 5;

    function loadBlogPosts() {
        // Assuming the JSON file is served from your server
        fetch('blog_posts.json')
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
            container.appendChild(postElement);
        }
        currentPostIndex += postsPerPage;
    }

    function isNearBottom() {
        return window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
    }

    window.addEventListener('scroll', function() {
        if (isNearBottom()) {
            loadBlogPosts();
        }
    });

    // Initial load
    loadBlogPosts();
});

