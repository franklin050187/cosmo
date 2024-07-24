document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.getElementById('menu-btn');
    // const loginBtn = document.getElementById('login-btn');
    // const loginForm = document.getElementById('login-form');

    menuBtn.addEventListener('click', function() {
        menuBtn.classList.toggle('open');
    });

    // loginBtn.addEventListener('click', function() {
    //     loginForm.style.display = loginForm.style.display === 'none' ? 'block' : 'none';
    // });

    // document.addEventListener('click', function(event) {
    //     if (event.target !== loginBtn && event.target !== loginForm) {
    //         loginForm.style.display = 'none';
    //     }
    // });

    // loginBtn.addEventListener('click', function(event) {
    //     event.stopPropagation();
    // });
    // loginForm.addEventListener('click', function(event) {
    //     event.stopPropagation();
    // });
});
