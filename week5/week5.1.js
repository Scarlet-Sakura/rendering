"use strict";

window.onload = function () {
  main();
};
async function main() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
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

  var camera_const = 1.5;
  var aspect_ratio = canvas.width / canvas.height;
  var sphere_option, object_option, texture_option;
  var numJitters = 1;
  var uniforms = new Float32Array([
    aspect_ratio,
    camera_const,
    sphere_option,
    object_option,
    texture_option,
    numJitters,
  ]);
  const uniformBuffer = device.createBuffer({
    size: 64, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  menu1.addEventListener("change", function () {
    // Get the selected value from menu1
    const sphere = document.getElementById("menu1").value;
    uniforms[2] = sphere;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    console.log(sphere);
    render(device, context, pipeline, bindGroups[0]);
  });
  menu2.addEventListener("change", function () {
    // Get the selected value from menu2
    const object = document.getElementById("menu2").value;
    uniforms[3] = object;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    render(device, context, pipeline, bindGroups[0]);
  });

  var button = document.getElementById("Texture");
  var isTextureEnabled = false; // Initialize to false

  button.addEventListener("click", function () {
    isTextureEnabled = !isTextureEnabled; // Toggle the state
    uniforms[4] = isTextureEnabled ? 1 : 0; // Set the value based on the state
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  });

  var addressMenu = document.getElementById("addressMenu");
  var filterMenu = document.getElementById("filterMenu");

  addressMenu.addEventListener("change", animate);
  filterMenu.addEventListener("change", animate);

  const vertexPositions = [
    [-0.2, 0.1, 0.9, 0.0], // Padded with an extra number
    [0.2, 0.1, 0.9, 0.0], // Padded with an extra number
    [-0.2, 0.1, -0.1, 0.0], // Padded with an extra number
  ];
  // the order in which the vertices should be connected
  const faceIndices = [[0, 1, 2, 0]]; // Padded with an extra number

  const vertexBuffer = device.createBuffer({
    size: vertexPositions.length * 4 * 4 + faceIndices.length * 4 * 4, // 4 bytes per float
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(
    vertexBuffer,
    0,
    new Float32Array(vertexPositions.flat())
  );
  device.queue.writeBuffer(
    vertexBuffer,
    vertexPositions.length * 16,
    new Uint32Array(faceIndices.flat())
  );

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

    texture.samplers = [];
    texture.samplers.push(
      device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "nearest",
        magFilter: "nearest",
      })
    );
    texture.samplers.push(
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
    );

    return texture;
  }

  const texture = await load_texture(device, "grass.jpg");
  var bindGroups = [];

  for (var i = 0; i < 4; i++) {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.samplers[i] },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: { buffer: uniformBuffer } },
        { binding: 3, resource: { buffer: vertexBuffer } },
      ],
    });
    bindGroups.push(bindGroup);
  }

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

  // Create event listeners for the select elements

  function animate() {
    var address = document.getElementById("addressMenu").value;
    var filter = document.getElementById("filterMenu").value;

    console.log("Address: " + address + ", Filter: " + filter);

    var groupNumber;

    if (address === "0" && filter === "0") {
      groupNumber = 0;
    }
    if (address === "0" && filter === "1") {
      groupNumber = 1;
    }
    if (address === "1" && filter === "0") {
      groupNumber = 2;
    }
    if (address === "1" && filter === "1") {
      groupNumber = 3;
    }

    render(device, context, pipeline, bindGroups[groupNumber]);
  }
}