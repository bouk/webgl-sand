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
  vec3 color = vec3(1.0) * texture2D(state, st).rgb;
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

int get(vec2 coord) {
  return int(texture2D(state, (gl_FragCoord.xy + coord) / u_resolution).r);
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  int sum = get(vec2(-1.0, -1.0)) +
  get(vec2( 0.0, -1.0)) +
  get(vec2( 1.0, -1.0)) +
  get(vec2(-1.0,  0.0)) +
  get(vec2( 1.0,  0.0)) +
  get(vec2(-1.0,  1.0)) +
  get(vec2( 0.0,  1.0)) +
  get(vec2( 1.0,  1.0));
  int res = get(vec2(0.0, 0.0));
  if (sum < 2 || sum > 3) {
    res = 0;
  } else if (sum == 3) {
    res = 1;
  }

  gl_FragColor = vec4(vec3(res == 0 ? 0.0 : 1.0), 1.0);
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

  let tex0 = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, i);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);

  let tex1 = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, i);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);

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
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex0, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[1]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex1, 0);

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
    if (t - lastRender > 100) {
      lastRender = t;
      // Bind state frame buffer, draw to it
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[bufIndex]);
      gl.useProgram(stepProgram);
      gl.uniform1i(stepStateLoc, 1 - bufIndex);
      gl.drawArrays(gl.TRIANGLES, 0, 6.0);
      bufIndex = 1 - bufIndex;
    }

    render();

    requestAnimationFrame(step);
  };
  render();
  requestAnimationFrame(step);
}
