/* eslint-env jasmine */

const { TextBuffer } = require('atom')

let waitForBufferToStopChanging = () => advanceClock(TextBuffer.prototype.stoppedChangingDelay)

let suggestionsForPrefix = (provider, editor, prefix, options) => {
  let bufferPosition = editor.getCursorBufferPosition()
  let scopeDescriptor = editor.getLastCursor().getScopeDescriptor()
  let suggestions = provider.getSuggestions({editor, bufferPosition, prefix, scopeDescriptor})
  if (options && options.raw) {
    return suggestions
  } else {
    if (suggestions) {
      return suggestions.then(sugs => sugs.map(sug => sug.text))
    } else {
      return Promise.resolve([])
    }
  }
}

describe('SubsequenceProvider', () => {
  let [completionDelay, editor, mainModule, autocompleteManager, provider] = []

  beforeEach(() => {
    // Set to live completion
    atom.config.set('autocomplete-plus.enableAutoActivation', true)
    atom.config.set('autocomplete-plus.defaultProvider', 'Subsequence')

    // Set the completion delay
    completionDelay = 100
    atom.config.set('autocomplete-plus.autoActivationDelay', completionDelay)
    completionDelay += 100 // Rendering delaya\

    let workspaceElement = atom.views.getView(atom.workspace)
    jasmine.attachToDOM(workspaceElement)

    waitsForPromise(() =>
      Promise.all([
        atom.workspace.open('sample.js').then((e) => { editor = e }),
        atom.packages.activatePackage('language-javascript'),
        atom.packages.activatePackage('autocomplete-plus').then((a) => {
          mainModule = a.mainModule
        })
      ]))

    runs(() => {
      autocompleteManager = mainModule.autocompleteManager
      advanceClock(1)
      provider = autocompleteManager.providerManager.defaultProvider
    })
  })

  // TODO: delete me once Atom release includes findWordsWithSubsequence
  if (TextBuffer.prototype.findWordsWithSubsequence) {
    it('runs a completion ', () => {
      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'quick').then(suggestions => {
          expect(suggestions).toContain('quicksort')
        })
      })
    })

    it('adds words to the symbol list after they have been written', () => {
      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'anew').then(suggestions => {
          expect(suggestions).not.toContain('aNewFunction')
          editor.insertText('function aNewFunction(){};')
          editor.insertText(' ')
          return suggestionsForPrefix(provider, editor, 'anew')
        }).then(suggestions => {
          expect(suggestions).toContain('aNewFunction')
        })
      })
    })

    it('adds words after they have been added to a scope that is not a direct match for the selector', () => {
      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'some').then(sugs => {
          expect(sugs).not.toContain('somestring')
          editor.insertText('abc = "somestring"')
          editor.insertText(' ')
          return suggestionsForPrefix(provider, editor, 'some')
        }).then(sugs => {
          expect(sugs).toContain('somestring')
        })
      })
    })

    it('removes words from the symbol list when they do not exist in the buffer', () => {
      editor.moveToBottom()
      editor.moveToBeginningOfLine()

      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'anew').then(sugs => {
          expect(sugs).not.toContain('aNewFunction')
          editor.insertText('function aNewFunction(){};')
          editor.moveToEndOfLine()
          return suggestionsForPrefix(provider, editor, 'anew')
        }).then(sugs => {
          expect(sugs).toContain('aNewFunction')
          editor.setCursorBufferPosition([13, 21])
          editor.backspace()
          editor.moveToTop()
          return suggestionsForPrefix(provider, editor, 'anew')
        }).then(sugs => {
          expect(sugs).toContain('aNewFunctio')
          expect(sugs).not.toContain('aNewFunction')
        })
      })
    })

    it('does not return the word under the cursor when there is only a prefix', () => {
      editor.moveToBottom()
      editor.insertText('qu')
      waitForBufferToStopChanging()

      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'qu').then(sugs => {
          expect(sugs).not.toContain('qu')
          editor.insertText(' qu')
          waitForBufferToStopChanging()
          return suggestionsForPrefix(provider, editor, 'qu')
        }).then(sugs => {
          expect(sugs).toContain('qu')
        })
      })
    })

    it('does not return the word under the cursor when there is a suffix and only one instance of the word', () => {
      editor.moveToBottom()
      editor.insertText('catscats')
      editor.moveToBeginningOfLine()
      editor.insertText('omg')

      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'omg').then(sugs => {
          expect(sugs).not.toContain('omg')
          expect(sugs).not.toContain('omgcatscats')
        })
      })
    })

    it('does not return the word under the cursors when are multiple cursors', () => {
      editor.moveToBottom()
      editor.setText('\n\n\n')
      editor.setCursorBufferPosition([0, 0])
      editor.addCursorAtBufferPosition([1, 0])
      editor.addCursorAtBufferPosition([2, 0])
      editor.insertText('omg')

      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'omg').then(sugs => {
          expect(sugs).not.toContain('omg')
        })
      })
    })

    it('returns the word under the cursor when there is a suffix and there are multiple instances of the word', done => {
      editor.moveToBottom()
      editor.insertText('icksort')
      waitForBufferToStopChanging()
      editor.moveToBeginningOfLine()
      editor.insertText('qu')
      waitForBufferToStopChanging()

      waitsForPromise(() => {
        return suggestionsForPrefix(provider, editor, 'qu').then(sugs => {
          expect(sugs).not.toContain('qu')
          expect(sugs).toContain('quicksort')
        })
      })
    })

    it('does not output suggestions from the other buffer', () => {
      let [coffeeEditor] = []

      waitsForPromise(() =>
        Promise.all([
          atom.packages.activatePackage('language-coffee-script'),
          atom.workspace.open('sample.coffee').then((e) => { coffeeEditor = e })
        ]).then(() => {
          advanceClock(1)
          return suggestionsForPrefix(provider, coffeeEditor, 'item')
        }).then(sugs => expect(sugs).toHaveLength(0))
      )
    })

    describe('search range', () => {
      it('includes the full range when the buffer is smaller than the max range', () => {
        const range = provider.clampedRange(500, 25, 100)
        expect(range.start.row).toBeLessThan(0)
        expect(range.end.row).toBeGreaterThan(100)
      })

      it('returns the expected result when cursor is close to end of large buffer', () => {
        const range = provider.clampedRange(100, 450, 500)
        expect(range.start.row).toBeLessThan(350)
      })

      it('returns the expected result when cursor is close to beginning of large buffer', () => {
        const range = provider.clampedRange(100, 50, 500)
        expect(range.end.row).toBeGreaterThan(100)
      })
    })

    describe('when autocomplete-plus.minimumWordLength is > 1', () => {
      beforeEach(() => atom.config.set('autocomplete-plus.minimumWordLength', 3))

      it('only returns results when the prefix is at least the min word length', () => {
        editor.insertText('function aNewFunction(){};')

        waitsForPromise(() =>
          Promise.all([
            '',
            'a',
            'an',
            'ane',
            'anew'
          ].map(suggestionsForPrefix.bind(null, provider, editor))).then(results => {
            expect(results[0]).not.toContain('aNewFunction')
            expect(results[1]).not.toContain('aNewFunction')
            expect(results[2]).not.toContain('aNewFunction')
            expect(results[3]).toContain('aNewFunction')
            expect(results[4]).toContain('aNewFunction')
          })
        )
      })
    })

    describe('when autocomplete-plus.minimumWordLength is 0', () => {
      beforeEach(() => atom.config.set('autocomplete-plus.minimumWordLength', 0))

      it('only returns results when the prefix is at least the min word length', () => {
        editor.insertText('function aNewFunction(){};')
        const testResultPairs = [
          ['', false],
          ['a', true],
          ['an', true],
          ['ane', true],
          ['anew', true]
        ]

        waitsForPromise(() =>
          Promise.all(
            testResultPairs.map(t => suggestionsForPrefix(provider, editor, t[0]))
          ).then(results => {
            results.forEach((result, idx) => {
              if (testResultPairs[idx][1]) {
                expect(result).toContain('aNewFunction')
              } else {
                expect(result).not.toContain('aNewFunction')
              }
            })
          })
        )
      })
    })

    describe("when the editor's path changes", () =>
      it('continues to track changes on the new path', () => {
        let buffer = editor.getBuffer()

        expect(provider.watchedBuffers.get(buffer)).toBe(editor)

        waitsForPromise(() =>
          suggestionsForPrefix(provider, editor, 'qu').then(sugs => {
            expect(sugs).toContain('quicksort')
            buffer.setPath('cats.js')
            expect(provider.watchedBuffers.get(buffer)).toBe(editor)
            editor.moveToBottom()
            editor.moveToBeginningOfLine()
            return Promise.all([
              suggestionsForPrefix(provider, editor, 'qu'),
              suggestionsForPrefix(provider, editor, 'anew')
            ])
          }).then(results => {
            expect(results[0]).toContain('quicksort')
            expect(results[1]).not.toContain('aNewFunction')
            editor.insertText('function aNewFunction(){};')
            waitForBufferToStopChanging()
            return suggestionsForPrefix(provider, editor, 'anew')
          }).then(sugs => {
            expect(sugs).toContain('aNewFunction')
          })
        )
      })
    )

    describe('when includeCompletionsFromAllBuffers is enabled', () => {
      beforeEach(() => {
        atom.config.set('autocomplete-plus.includeCompletionsFromAllBuffers', true)

        waitsForPromise(() =>
          Promise.all([
            atom.packages.activatePackage('language-coffee-script'),
            atom.workspace.open('sample.coffee').then((e) => { editor = e })
          ]))

        runs(() => advanceClock(1))
      })

      afterEach(() => atom.config.set('autocomplete-plus.includeCompletionsFromAllBuffers', false))

      it('outputs unique suggestions', () => {
        editor.setCursorBufferPosition([7, 0])

        waitsForPromise(() =>
          suggestionsForPrefix(provider, editor, 'qu').then(sugs => {
            expect(sugs).toHaveLength(2)
          })
        )
      })

      it('outputs suggestions from the other buffer', () => {
        editor.setCursorBufferPosition([7, 0])

        waitsForPromise(() =>
          suggestionsForPrefix(provider, editor, 'item').then(sugs => {
            expect(sugs[0]).toBe('items')
          })
        )
      })
    })

  // TODO: commenting this out because I'm not sure what it's trying to test
  //       just remove it? (This was brought over from the symbol provider spec.)
  //   describe('when the autocomplete.symbols changes between scopes', () => {
  //     beforeEach(() => {
  //       editor.setText(`// in-a-comment
  // inVar = "in-a-string"`
  //       )
  //       waitForBufferToStopChanging()
  //
  //       let commentConfig = {
  //         incomment: {
  //           selector: '.comment'
  //         }
  //       }
  //
  //       let stringConfig = {
  //         instring: {
  //           selector: '.string'
  //         }
  //       }
  //
  //       atom.config.set('autocomplete.symbols', commentConfig, {scopeSelector: '.source.js .comment'})
  //       atom.config.set('autocomplete.symbols', stringConfig, {scopeSelector: '.source.js .string'})
  //     })
  //
  //     it('uses the config for the scope under the cursor', () => {
  //       // Using the comment config
  //       editor.setCursorBufferPosition([0, 2])
  //
  //       waitsForPromise(() =>
  //         suggestionsForPrefix(provider, editor, 'in', {raw: true}).then(sugs => {
  //           expect(sugs).toHaveLength(1)
  //           expect(sugs[0].text).toBe('in-a-comment')
  //           expect(sugs[0].type).toBe('incomment')
  //
  //           // Using the string config
  //           editor.setCursorBufferPosition([1, 20])
  //           editor.insertText(' ')
  //           waitForBufferToStopChanging()
  //
  //           return suggestionsForPrefix(provider, editor, 'in', {raw: true})
  //         }).then(sugs => {
  //           expect(sugs).toHaveLength(1)
  //           expect(sugs[0].text).toBe('in-a-string')
  //           expect(sugs[0].type).toBe('instring')
  //
  //           editor.setCursorBufferPosition([1, Infinity])
  //           editor.insertText(' ')
  //           waitForBufferToStopChanging()
  //
  //           return suggestionsForPrefix(provider, editor, 'in', {raw: true})
  //         }).then(sugs => {
  //           expect(sugs).toHaveLength(3)
  //           expect(sugs[0].text).toBe('inVar')
  //           expect(sugs[0].type).toBe('')
  //         })
  //       )
  //     })
  //   })
  //
  //   describe('when the config contains a list of suggestion strings', () => {
  //     beforeEach(() => {
  //       editor.setText('// abcomment')
  //       waitForBufferToStopChanging()
  //
  //       let commentConfig = {
  //         comment: { selector: '.comment' },
  //         builtin: {
  //           suggestions: ['abcd', 'abcde', 'abcdef']
  //         }
  //       }
  //
  //       atom.config.set('autocomplete.symbols', commentConfig, {scopeSelector: '.source.js .comment'})
  //     })
  //
  //     it('adds the suggestions to the results', () => {
  //       // Using the comment config
  //       editor.setCursorBufferPosition([0, 2])
  //
  //       waitsForPromise(() =>
  //         suggestionsForPrefix(provider, editor, 'ab', {raw: true}).then(suggestions => {
  //           expect(suggestions).toHaveLength(4)
  //           expect(suggestions[0].text).toBe('abcomment')
  //           expect(suggestions[0].type).toBe('comment')
  //           expect(suggestions[1].text).toBe('abcdef')
  //           expect(suggestions[1].type).toBe('builtin')
  //         })
  //       )
  //     })
  //   })

    describe('when the symbols config contains a list of suggestion objects', () => {
      beforeEach(() => {
        editor.setText('// abcomment')
        waitForBufferToStopChanging()

        let commentConfig = {
          comment: { selector: '.comment' },
          builtin: {
            suggestions: [
              {nope: 'nope1', rightLabel: 'will not be added to the suggestions'},
              {text: 'abcd', rightLabel: 'one', type: 'function'},
              []
            ]
          }
        }
        atom.config.set('autocomplete.symbols', commentConfig, {scopeSelector: '.source.js .comment'})
      })

      it('adds the suggestion objects to the results', () => {
        // Using the comment config
        editor.setCursorBufferPosition([0, 2])

        waitsForPromise(() =>
          suggestionsForPrefix(provider, editor, 'ab', {raw: true}).then(suggestions => {
            expect(suggestions).toHaveLength(2)
            expect(suggestions[0].text).toBe('abcd')
            expect(suggestions[0].type).toBe('function')
            expect(suggestions[0].rightLabel).toBe('one')
            expect(suggestions[1].text).toBe('abcomment')
            expect(suggestions[1].type).toBe('comment')
          })
        )
      })
    })

    describe('when the legacy completions array is used', () => {
      beforeEach(() => {
        editor.setText('// abcomment')
        waitForBufferToStopChanging()
        atom.config.set('editor.completions', ['abcd', 'abcde', 'abcdef'], {scopeSelector: '.source.js .comment'})
      })

      it('uses the config for the scope under the cursor', () => {
        // Using the comment config
        editor.setCursorBufferPosition([0, 2])

        waitsForPromise(() =>
          suggestionsForPrefix(provider, editor, 'ab', {raw: true}).then(suggestions => {
            expect(suggestions).toHaveLength(4)
            expect(suggestions[0].text).toBe('abcd')
            expect(suggestions[0].type).toBe('builtin')
            expect(suggestions[3].text).toBe('abcomment')
            expect(suggestions[3].type).toBe('')
          })
        )
      })
    })

    it('adds words to the wordlist with unicode characters', () => {
      atom.config.set('autocomplete-plus.enableExtendedUnicodeSupport', true)
      waitsForPromise(() =>
        suggestionsForPrefix(provider, editor, 'somē', {raw: true}).then(suggestions => {
          expect(suggestions).toHaveLength(0)
          editor.insertText('somēthingNew')
          editor.insertText(' ')
          waitForBufferToStopChanging()

          return suggestionsForPrefix(provider, editor, 'somē', {raw: true})
        }).then(suggestions => {
          expect(suggestions).toHaveLength(1)
        })
      )
    })
  }
})
