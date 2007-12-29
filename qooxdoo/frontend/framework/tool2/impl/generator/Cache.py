import os, sys, sha, cPickle
from misc import filetool

class Cache:
    def __init__(self, config, console):
        self._path = config.get("path")
        self._console = console
        self._memory = {}


    def clean(self, cacheId):
        cacheFile = os.path.join(self._path, sha.new(cacheId).hexdigest())
        filetool.remove(cacheFile)


    def read(self, cacheId, dependsOn, memory=False):
        if self._memory.has_key(cacheId):
            return self._memory[cacheId]

        filetool.directory(self._path)
        fileModTime = os.stat(dependsOn).st_mtime
        cacheFile = os.path.join(self._path, sha.new(cacheId).hexdigest())

        try:
            cacheModTime = os.stat(cacheFile).st_mtime
        except OSError:
            cacheModTime = 0

        # Out of date check
        if fileModTime > cacheModTime:
            return None

        try:
            content = cPickle.load(open(cacheFile, 'rb'))

            if memory:
                self._memory[cacheId] = content

            return content

        except (IOError, EOFError, cPickle.PickleError, cPickle.UnpicklingError):
            self._console.error("Could not read cache from %s" % self._path)
            return None


    def write(self, cacheId, content, memory=False):
        filetool.directory(self._path)
        cacheFile = os.path.join(self._path, sha.new(cacheId).hexdigest())

        try:
            cPickle.dump(content, open(cacheFile, 'wb'), 2)

        except (IOError, EOFError, cPickle.PickleError, cPickle.PicklingError):
            self._console.error("Could not store cache to %s" % self._path)
            sys.exit(1)

        if memory:
            self._memory[cacheId] = content
