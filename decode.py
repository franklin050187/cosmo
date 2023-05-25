from PIL import Image

def retrieve_lsb_data_from_png(image_path):
    # Open the PNG image
    image = Image.open(image_path)

    # Get the pixel data
    pixels = image.load()

    # Retrieve LSB data from each pixel
    data = []
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]  # Assuming RGBA format, ignore alpha channel

            # Retrieve LSB data from red, green, and blue channels
            r_lsb = r & 1
            g_lsb = g & 1
            b_lsb = b & 1

            # Combine LSBs into a byte and add it to the data list
            byte = (r_lsb << 2) | (g_lsb << 1) | b_lsb
            data.append(byte)

    return data

# Usage example
image_path = "ship.png"
lsb_data = retrieve_lsb_data_from_png(image_path)
print(lsb_data)
