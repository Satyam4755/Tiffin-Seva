document.getElementById('venderForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = 'block';

    const formData = new FormData(this);

    setTimeout(() => {
        fetch(this.action, {
            method: 'POST',
            body: formData
        })
        .then(async response => {
            spinner.style.display = 'none';

            // Handle if not JSON
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                throw new Error("Expected JSON but got: " + text.slice(0, 100));
            }

            const data = await response.json();

            if (data.success) {
                alert('vender added/updated successfully!');
                window.location.href = '/vender/venders_list'; // <-- this line should work now
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            spinner.style.display = 'none';
            alert('An error occurred: ' + error.message);
            console.error(error);
        });
    }, 5000);
});
