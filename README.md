A StreamDeck+ and SQS integration allowing to receive messages from SQS, converting them to an image, and changing the StreamDeck+'s touchscreen background image.
This is very hacky btw.

## Why? 
StreamDeck's SDK doesn't allow to change the background image of the entire touchscreen dynamically. For my needs, I needed SQS to send and receive messages, but you could scrape that and simply keep the image background changing. 
