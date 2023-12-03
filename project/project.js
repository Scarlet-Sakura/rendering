"use strict";

window.onload = function () {
  main();
};

async function main() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    console.error("WebGPU is not available");
    return;
  }

  const device = await adapter.requestDevice();
  const canvas = document.getElementById("webgpu-canvas");
  const context =
    canvas.getContext("gpupresent") || canvas.getContext("webgpu");

  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device,
    format: canvasFormat,
  });
  const wgsl = device.createShaderModule({
    code: document.getElementById("wgsl").text,
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: wgsl,
      entryPoint: "main_vs",
    },
    fragment: {
      module: wgsl,
      entryPoint: "main_fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: {
      topology: "triangle-strip",
    },
  });

  var camera_const = 1.0;
  var aspect_ratio = canvas.width / canvas.height;
  var rotation_angle = 90 * (Math.PI / 180);

  var uniforms = new Float32Array([
    aspect_ratio,
    camera_const,
    rotation_angle,
  ]);
  const uniformBufferSize = 2 * uniforms.byteLength;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(uniformBuffer, 0, uniforms);

  
  async function load_texture(device, filename) {
    const img = document.createElement("img");
    img.src = filename;
    await img.decode();
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = img.width;
    imageCanvas.height = img.height;
    const imageCanvasContext = imageCanvas.getContext("2d");
    imageCanvasContext.drawImage(
      img,
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );
    const imageData = imageCanvasContext.getImageData(
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );

    let textureData = new Uint8Array(img.width * img.height * 4);
    for (let i = 0; i < img.height; ++i)
      for (let j = 0; j < img.width; ++j)
        for (let k = 0; k < 4; ++k)
          textureData[(i * img.width + j) * 4 + k] =
            imageData.data[((img.height - i - 1) * img.width + j) * 4 + k];

    const texture = device.createTexture({
      size: [img.width, img.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    device.queue.writeTexture(
      { texture: texture },
      textureData,
      { offset: 0, bytesPerRow: img.width * 4, rowsPerImage: img.height },
      [img.width, img.height, 1]
    );

    texture.sampler = [];
    texture.sampler.push(
      device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "nearest",
        magFilter: "nearest",
      })
    );
    /*texture.samplers.push(
      device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "linear",
        magFilter: "linear",
      })
    );
    texture.samplers.push(
      device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "nearest",
        magFilter: "nearest",
      })
    );
    texture.samplers.push(
      device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "linear",
        magFilter: "linear",
      })
    );*/

    return texture;
  }

  var patternSelect = document.getElementById("patterns");
  var patternFlag;

  patternSelect.addEventListener("change", function (event) {
    // Update the flag based on the selected pattern
    patternFlag = event.target.value;

    // You can use the flag to determine which texture resources to use
    updateBindGroups();
  });

  async function updateBindGroups() {
    // Clear existing bind groups
      // Create bind groups based on the pattern flag
      let texture;
      if (patternFlag === "checkered") {
        texture = await load_texture(device, "checkered.jpg");
      } else if (patternFlag === "geometric") {
        texture = await load_texture(device, "geometric.jpg");
      } else if (patternFlag === "waves") {
        texture = await load_texture(device, "water.jpg");
      }
   
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: texture.sampler[0] },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
          ],
        });
        console.log(texture.samplers)
      
        render(device, context, pipeline, bindGroup);

    // Trigger a render with the updated bind groups
    
  }

  // Initial setup
  patternFlag = patternSelect.value;
  updateBindGroups();

  // Add an event listener to an input element for rotation_angle
  var rotationAngleInput = document.getElementById("rotationAngle");
  var rotationAngleValue = document.getElementById("rotationAngleValue");
 
  function rotate() {
    rotationAngleInput.addEventListener("input", function (event) {
      // Parse the input value as a float
      const newRotationAngleDegrees = parseFloat(event.target.value);
      // Check if the value is a valid number
      const newRotationAngleRadians =
        newRotationAngleDegrees * (Math.PI / 180);

      // Check if the value is a valid number
      if (!isNaN(newRotationAngleRadians)) {
        // Update the rotation_angle in the array
        uniforms[2] = newRotationAngleRadians;
        // Update the rotation angle display on the screen
        rotationAngleValue.innerText = `Rotation Angle: ${newRotationAngleDegrees} degrees`;

        // Write the updated array to the uniform buffer
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        updateBindGroups();
       
      }
      
    });
  }

  rotate();
  function render(device, context, pipeline, bindGroup) {
  
    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    // Insert render pass commands here
    pass.setPipeline(pipeline);

    // Set the bind group which contains both bindings
    pass.setBindGroup(0, bindGroup);

    // Draw
    pass.draw(4);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }


}

