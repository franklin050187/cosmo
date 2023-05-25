# trying to read the data using 2 bits per channel and without alpha
# added gzip header 
# added the byte lenght to the header still error, i believe it has 


import gzip
from PIL import Image

def retrieve_low_order_bits_from_png(image_path, num_bits):
    # Open the PNG image
    image = Image.open(image_path)

    # Get the pixel data
    pixels = image.load()

    # Retrieve the low-order bits from each pixel channel
    data = bytearray()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]  # Adjust the order of color channels

            # Retrieve the low-order bits from red, green, blue, and alpha channels
            r_low = r & ((1 << num_bits) - 1)  # line 103 get 2 bits per channel
            g_low = g & ((1 << num_bits) - 1)
            b_low = b & ((1 << num_bits) - 1)
            # a_low = a & ((1 << num_bits) - 1) line 103 0 bit used to store on the alpha channel

            # Combine the low-order bits into a byte and append it to the data bytearray
            byte = (r_low << (2 * num_bits)) | (g_low << num_bits) | b_low  # | a_low
            data.append(byte)

    # Add gzip header to the beginning of the data bytearray
    gzip_header = b'\x1f\x8b\x08\x08\xe2\x12\xc4R\x02\xffship.png'
    header_with_length = gzip_header[:4] + len(data).to_bytes(4, byteorder='little') + gzip_header[8:]
    data_with_header = header_with_length + bytes(data)

    return data_with_header

# Usage example
image_path = "decode_ship_data/ship.png"
num_bits = 2
low_order_bits_data = retrieve_low_order_bits_from_png(image_path, num_bits)

print(low_order_bits_data)

# Decompress the low-order bits data using gzip
decompressed_data = gzip.decompress(low_order_bits_data)

# Decode the decompressed data as UTF-8
decoded_data = decompressed_data.decode("utf-8")

print(decoded_data)
