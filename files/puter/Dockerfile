FROM ghcr.io/heyputer/puter:latest

# Fix CORS credentials (Puter 2.5.x bug — commented out in source)
RUN sed -i "s|// res.setHeader('Access-Control-Allow-Credentials', true);|res.setHeader('Access-Control-Allow-Credentials', true);|g" \
    /opt/puter/app/src/backend/src/modules/web/WebServerService.js

# Fix Socket.IO CORS credentials
RUN sed -i "s|cors: {|cors: { credentials: true,|g" \
    /opt/puter/app/src/backend/src/modules/web/SocketioService.js

# Disable Camera/Recorder auto-launch (cloud-only apps, not available in self-hosted)
RUN sed -i 's/app-5584fbf7-ed69-41fc-99cd-85da21b1ef51/disabled-camera/g' \
    /opt/puter/app/dist/bundle.min.js && \
    sed -i 's/app-7bdca1a4-6373-4c98-ad97-03ff2d608ca1/disabled-recorder/g' \
    /opt/puter/app/dist/bundle.min.js
