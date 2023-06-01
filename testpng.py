from tagextractor import PNGTagExtractor

extractor = PNGTagExtractor()
tags = extractor.extract_tags("https://i.ibb.co/5L1W44Z/47bdfd1a8046.png")
print(tags)