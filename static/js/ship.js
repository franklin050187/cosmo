
function downloadShip(imageUrl) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/download/" + imageUrl, true);
    xhr.responseType = "blob"; // Set the response type to 'blob' to handle binary data
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            // Create a temporary link element to download the file
            var link = document.createElement("a");
            link.href = window.URL.createObjectURL(xhr.response);
            link.download = xhr.getResponseHeader("Content-Disposition").split("filename=")[1];
            link.click();
        }
    };
    xhr.send();
}

// Get all the submission number elements
var numberElements = document.querySelectorAll('.number');

// Loop through each element
numberElements.forEach(function (element) {
    // Get the number string
    var decimalnumber = element.textContent;

    // convert to float decimal number
    var number = parseFloat(decimalnumber);

    // show only 2 decimal places
    var formattedNumber = number.toFixed(2);

    // Update the submission date element with the formatted date
    element.textContent = formattedNumber;
});

function fetchData(imgUrl) {
    var fetchButton = document.getElementById('fetch-button');
    var originalContent = fetchButton.innerHTML;

    // Replace button content with a loading spinner
    fetchButton.innerHTML = '<span class="spinner"></span>';
    // Create a new XMLHttpRequest object
    var xhr = new XMLHttpRequest();

    // Configure it: GET-request for the URL /analyze?url=' + imgUrl
    xhr.open('GET', '/analyze?url=' + imgUrl, true);

    // Set up the callback function to handle the response
    xhr.onreadystatechange = function () {
        // If the request is completed and the response is ready
        if (xhr.readyState === 4) {
            // If the request was successful
            if (xhr.status === 200) {
                // Parse the JSON response
                var data = JSON.parse(xhr.responseText);

                // Display the data
                displayData(data.datadata);
            } else {
                // Handle the error
                document.getElementById('output').textContent = 'Error fetching data';
            }
        }
    };

    // Send the request
    xhr.send();
}

function displayData(data) {
    var output = document.getElementById('output');

    // Clear the existing content
    output.innerHTML = '';

    // Update the conditional content
    var conditionalContent = document.getElementById('conditional-content');
    conditionalContent.innerHTML = '';

    if (data.url_com) {
        var imgCom = document.createElement('img');
        imgCom.src = data.url_com;
        imgCom.width = 512;
        conditionalContent.appendChild(imgCom);

        var imgAnalysis = document.createElement('img');
        imgAnalysis.src = data.analysis.url_analysis;
        imgAnalysis.width = 512;
        conditionalContent.appendChild(imgAnalysis);
    }

    // Create new elements for the fetched data
    var properties = [
        { label: 'Center of Mass X', value: (data.center_of_mass_x).toFixed(2) },
        { label: 'Center of Mass Y', value: (data.center_of_mass_y).toFixed(2) },
        { label: 'Total Mass', value: (data.total_mass).toFixed(2) },
        { label: 'Top Speed', value: (data.top_speed).toFixed(2) },
        // { label: 'Price', value: data.price },
        // { label: 'Crew', value: data.crew },
        // { label: 'Tags', value: data.tags.join(', ') }
    ];

    properties.forEach(function (property) {
        var p = document.createElement('p');
        p.innerHTML = `<span class="data"><span>${property.label}: </span>${property.value}</span>`;
        output.appendChild(p);
    });

    var speeds = data.all_direction_speeds;
    for (var direction in speeds) {
        var p = document.createElement('p');
        p.innerHTML = `<span class="data"><span>Speed ${direction}: </span>${(speeds[direction]).toFixed(2)}</span>`;
        output.appendChild(p);
    }

    var prices = data.analysis;
    for (var priceType in prices) {
        if (priceType !== 'url_analysis' && priceType !== 'total_price') {
            var p = document.createElement('p');
            p.innerHTML = `<span class="data"><span>${priceType.replace('_', ' ')}:<br></span>${(prices[priceType].percent * 100).toFixed(2)}% | ${prices[priceType].price}₡</span>`;
            output.appendChild(p);
        }
    }
}


