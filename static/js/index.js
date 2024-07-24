document.addEventListener('DOMContentLoaded', function() {

    var urlParams = new URLSearchParams(window.location.search);
    var order = urlParams.get('order');
    if (order === 'pop') {
        document.getElementById('order-pop-btn').classList.add('active');
        document.getElementById('order-new-btn').classList.remove('active');
        document.getElementById('order-fav-btn').classList.remove('active');
    } else if (order === 'fav') {
        document.getElementById('order-fav-btn').classList.add('active');
        document.getElementById('order-new-btn').classList.remove('active');
        document.getElementById('order-pop-btn').classList.remove('active');
    } else {
        document.getElementById('order-new-btn').classList.add('active');
        document.getElementById('order-pop-btn').classList.remove('active');
        document.getElementById('order-fav-btn').classList.remove('active');
    }
    

    const search = document.getElementById('search-btn');
    const tags = document.getElementById('tags-btn');
    const ordernew = document.getElementById('order-new-btn');
    const orderpop = document.getElementById('order-pop-btn');
    const orderfav = document.getElementById('order-fav-btn');

    if (typeof $ !== 'function') {
        console.error('jQuery is not defined.');
        return;
    }

    ordernew.addEventListener('click', function() {
        if (!this.classList.contains('active')) {
            orderpop.classList.remove('active');
            orderfav.classList.remove('active');
            this.classList.add('active');
        }
    })

    orderpop.addEventListener('click', function() {
        if (!this.classList.contains('active')) {
            ordernew.classList.remove('active');
            orderfav.classList.remove('active');
            this.classList.add('active');
        }
    })

    orderfav.addEventListener('click', function() {
        if (!this.classList.contains('active')) {
            ordernew.classList.remove('active');
            orderpop.classList.remove('active');
            this.classList.add('active');
        }
    })

    search.addEventListener('click', function() {
        if (!this.classList.contains('active')) {
            tags.classList.remove('active');
            this.classList.add('active');
            document.getElementById('search-tab').style.display = 'block';
            document.getElementById('tags-tab').style.display = 'none';
        }
    });
    
    tags.addEventListener('click', function() {
        if (!this.classList.contains('active')) {
            search.classList.remove('active');
            this.classList.add('active');
            document.getElementById('tags-tab').style.display = 'block';
            document.getElementById('search-tab').style.display = 'none';
        }
    });
});



    