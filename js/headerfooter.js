(function() {
    const loaderOverlay = document.createElement('div');
    loaderOverlay.id = 'global-loader-overlay';
    loaderOverlay.style.position = 'fixed';
    loaderOverlay.style.top = '0';
    loaderOverlay.style.left = '0';
    loaderOverlay.style.width = '100%';
    loaderOverlay.style.height = '100%';
    loaderOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    loaderOverlay.style.zIndex = '9999';
    loaderOverlay.style.display = 'flex';
    loaderOverlay.style.justifyContent = 'center';
    loaderOverlay.style.alignItems = 'center';
    loaderOverlay.style.opacity = '1';
    loaderOverlay.style.transition = 'opacity 0.9s ease-out';
    const spinnerContainer = document.createElement('div');
    spinnerContainer.innerHTML = `
        <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
            <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2 text-muted" style="font-family: 'Poppins', sans-serif;">Loading...</p>
    `;
    spinnerContainer.style.textAlign = 'center';
    loaderOverlay.appendChild(spinnerContainer);
    function appendLoader() {
        if (document.body) {
            document.body.appendChild(loaderOverlay);
            document.removeEventListener('DOMContentLoaded', appendLoader);
        }
    }

    if (document.body) {
        appendLoader();
    } else {
        document.addEventListener('DOMContentLoaded', appendLoader);
    }

    function hideLoader() {
        const overlay = document.getElementById('global-loader-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 400); 
        }
    }
    window.addEventListener('load', hideLoader);
    setTimeout(hideLoader, 10000);

})();

function loadHeaderAndFooter() {
    fetch("/html/header.html")
        .then(response => response.ok ? response.text() : Promise.reject('Header not found'))
        .then(data => {
            const headerPlaceholder = document.getElementById("header-placeholder");
            if (headerPlaceholder) headerPlaceholder.innerHTML = data;
        })
        .catch(error => console.error("Error loading header:", error));

    fetch("/html/footer.html")
        .then(response => response.ok ? response.text() : Promise.reject('Footer not found'))
        .then(data => {
            const footerPlaceholder = document.getElementById("footer-placeholder");
             if (footerPlaceholder) footerPlaceholder.innerHTML = data;
         })
        .catch(error => console.error("Error loading footer:", error));
}

function loadHeader() {
  fetch('/html/header.html')
      .then(response => response.text())
      .then(data => {
          document.getElementById('header-placeholder').innerHTML = data;
      })
      .catch(error => console.error('Error loading header:', error));
}

function loadFooter() {
  fetch('/html/footer.html')
      .then(response => response.text())
      .then(data => {
          document.getElementById('footer-placeholder').innerHTML = data;
      })
      .catch(error => console.error('Error loading footer:', error));
}

window.onload = function () {
  loadHeader();
  loadFooter();
};
