# Use official Python image as the base image
FROM python:3.9

# Set the working directory in the container
WORKDIR /app

# Download the project source code from GitHub
ADD https://github.com/franklin050187/cosmo/archive/refs/heads/docker.zip /app

# Unzip the downloaded file
RUN unzip docker.zip && rm docker.zip && mv cosmo-docker cosmo

# Change the working directory to the project directory
WORKDIR /app/cosmo

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port 8000
EXPOSE 8000

# Command to start the server
CMD ["python", "server.py"]