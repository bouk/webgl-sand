const vertexShader = `
#ifdef GL_ES
precision mediump float;
#endif

attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const renderShader = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform sampler2D state;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  // flip it!
  st.y = 1.0 - st.y;
  vec4 val = texture2D(state, st);
  int kind = int(val.r * 255.0);
  vec3 color = vec3(1.0, 0.0, 1.0) * (kind == 123 ? 1.0 : 0.0) + vec3(0.0, val.g, val.b);
  gl_FragColor = vec4(color, 1.0);
}
`;

const simulateShader = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;

// Previous state
uniform sampler2D state;

ivec4 get(vec2 coord) {
  return ivec4(texture2D(state, (gl_FragCoord.xy + coord) / u_resolution) * 255.0);
}

ivec4 get(int dx, int dy) {
  return get(vec2(float(dx), float(dy)));
}

#define VOID 0
#define WALL 1
#define SAND 2

#define GOL 123

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;

  int sum = int(get(-1, -1).x == GOL) +
  int(get( 0, -1).x == GOL) +
  int(get( 1, -1).x == GOL) +
  int(get(-1,  0).x == GOL) +
  int(get( 1,  0).x == GOL) +
  int(get(-1,  1).x == GOL) +
  int(get( 0,  1).x == GOL) +
  int(get( 1,  1).x == GOL);

  ivec4 res = get(0, 0);
  if (res.x == GOL) {
    if (sum < 2 || sum > 3) {
      res.x = VOID;
      res.y = 0;
    } else {
      res.y += 1;
    }
  } else if (sum == 3) {
    res.x = GOL;
    res.z = 0;
  } else {
    res.z += 1;
  }

  gl_FragColor = vec4(res) / 255.0;
}
`;

const i = new Image();
i.onload = main;
i.src = "game-of-life.png";

function main() {
  const canvas = document.querySelector("#canvas");
  canvas.width = 64;
  canvas.height = 64;

  const gl = canvas.getContext("webgl");

  const compileShader = (t, source) => {
    const s = gl.createShader(t);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw `Could not compile shader ${t} ${source} ${gl.getShaderInfoLog(s)}`;
    }
    return s;
  };

  const vShader = compileShader(gl.VERTEX_SHADER, vertexShader);
  const fShader = compileShader(gl.FRAGMENT_SHADER, renderShader);

  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  gl.deleteShader(fShader);

  const stepShader = compileShader(gl.FRAGMENT_SHADER, simulateShader);

  const stepProgram = gl.createProgram();
  gl.attachShader(stepProgram, vShader);
  gl.attachShader(stepProgram, stepShader);
  gl.linkProgram(stepProgram);

  gl.deleteShader(vShader);
  gl.deleteShader(stepShader);

  const a = new Uint8Array(canvas.width * canvas.height * 4);
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    a[i*4] = Math.random() > 0.5 ? 123 : 0;
    a[i*4+1] = 0;
    a[i*4+2] = 0;
    a[i*4+3] = 0;
  }

  const tex = [0, 1].map((i) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  });

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), gl.STATIC_DRAW);

  const verticesLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(verticesLoc);
  gl.vertexAttribPointer(verticesLoc, 2, gl.FLOAT, false, 0, 0);

  /* Don't need to do this again because the previous one already did it??
  const verticesLoc = gl.getAttribLocation(stepProgram, 'a_position');
  gl.enableVertexAttribArray(verticesLoc);
  gl.vertexAttribPointer(verticesLoc, 2, gl.FLOAT, false, 0, 0);
  */

  let resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
  gl.useProgram(program);
  gl.uniform2f(resolutionLoc, canvas.width, canvas.height);

  resolutionLoc = gl.getUniformLocation(stepProgram, 'u_resolution');
  gl.useProgram(stepProgram);
  gl.uniform2f(resolutionLoc, canvas.width, canvas.height);

  const progStateLoc = gl.getUniformLocation(program, "state");
  const stepStateLoc = gl.getUniformLocation(stepProgram, "state");

  const buffers = [gl.createFramebuffer(), gl.createFramebuffer()];
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[0]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[0], 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[1]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[1], 0);

  gl.viewport(0, 0, canvas.width, canvas.height);

  let bufIndex = 0;

  const render = () => {
    // Unbind frame buffer (i.e. set output to canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);
    gl.uniform1i(progStateLoc, bufIndex);
    gl.drawArrays(gl.TRIANGLES, 0, 6.0);
  };

  let lastRender = performance.now();
  const step = () => {
    const t = performance.now();
    //if (t - lastRender > 100) {
      lastRender = t;
      // Bind state frame buffer, draw to it
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[bufIndex]);
      gl.useProgram(stepProgram);
      gl.uniform1i(stepStateLoc, 1 - bufIndex);
      gl.drawArrays(gl.TRIANGLES, 0, 6.0);
      bufIndex = 1 - bufIndex;
    //}

    render();

    requestAnimationFrame(step);
  };
  render();
  requestAnimationFrame(step);
}
