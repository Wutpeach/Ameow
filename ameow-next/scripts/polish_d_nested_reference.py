"""Independent Python oracle from tagged Motion11.12.0 find/index equations.
Not a browser runtime, MotionValue finite-difference velocity or GPU measurement.
"""
import math
import struct

def f32(value):
    return struct.unpack('f', struct.pack('f', value))[0]

def coefficients(speed):
    velocity = -speed / 1000
    z, duration = .9, .8
    w = 5 / duration
    for _ in range(11):
        decay = w * z
        exponential = math.exp(-decay * duration)
        envelope = .001 - (decay - velocity) / (w * math.sqrt(1-z*z)) * exponential
        derivative = (-1 if -envelope + .001 > 0 else 1) * (
            ((decay * duration * velocity + velocity) - z*z*w*w*duration) * exponential
        ) / (w*w*math.sqrt(1-z*z))
        w -= envelope / derivative
    return w, 2*z*w

class Axis:
    def __init__(self, origin, target, speed, start):
        self.target, self.start = target, start
        self.w, damping = coefficients(speed)
        self.decay = damping / 2
        self.frequency = self.w * math.sqrt(1-.9**2)
        self.c = origin - target
        self.s = (speed + self.decay * self.c) / self.frequency

    def sample(self, now):
        ms = max(0, now-self.start)
        if ms >= 800:
            return self.target, 0, False
        t = ms / 1000
        sine, cosine = math.sin(self.frequency*t), math.cos(self.frequency*t)
        exp = math.exp(-self.decay*t)
        position = self.target + exp*(self.c*cosine + self.s*sine)
        velocity = exp*((-self.decay*self.c + self.frequency*self.s)*cosine +
                        (-self.decay*self.s - self.frequency*self.c)*sine)
        return position, velocity, True

def target(pointer):
    d = [v-100 for v in pointer]
    r = math.hypot(*d)
    return [v*.06*max(0, 1-r/200) for v in d]

def project(position, velocity):
    r = math.hypot(*position)
    if r >= 3:
        unit = [p/r for p in position]
        position = [3*p for p in unit]
        outward = max(0, sum(v*p for v, p in zip(velocity, unit)))
        velocity = [v-outward*p for v, p in zip(velocity, unit)]
    return position, velocity

class Follow:
    def __init__(self):
        self.axes = [None, None]
        self.position, self.velocity = [0,0], [0,0]
        self.targets = [0,0]

    def sample(self, now, targets, suppressed=False):
        if suppressed:
            self.__init__()
            return self.position, self.velocity
        for axis in range(2):
            segment = self.axes[axis]
            if segment:
                self.position[axis], self.velocity[axis], active = segment.sample(now)
                if not active:
                    self.axes[axis] = None
        self.position, self.velocity = project(self.position, self.velocity)
        for axis in range(2):
            if targets[axis] != self.targets[axis]:
                self.axes[axis] = Axis(self.position[axis], targets[axis], self.velocity[axis], now)
        self.targets = list(targets)
        return list(self.position), list(self.velocity)
